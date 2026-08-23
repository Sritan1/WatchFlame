"""What's on the ground at a point, which is really "is there anything to burn?"

Asks the National Land Cover Database and folds its class codes into a handful of
fuel categories. Without it the ignition model flagged downtown blocks as dangerous
on a hot windy day. Land cover barely moves, so results cache forever. Offshore or
off-grid comes back None.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

# EPA's copy of the 2019 data, 30m across the lower 48. `identify` only resolves a
# lat/lon point when the spatial reference sits inside the geometry, not passed as
# its own parameter.
IMAGESERVER = (
    "https://enviroatlas.epa.gov/arcgis/rest/services/"
    "Supplemental/nlcd_2019_landcover/ImageServer"
)
IDENTIFY_URL = f"{IMAGESERVER}/identify"

# ValueError is in here so a 200 that isn't JSON fails like a network error
# rather than escaping the handler.
_NET_ERRORS = (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError, ValueError)

# Cached forever, land cover doesn't move. Holds raw codes instead of
# categories, so changing categorize() needs no re-query. Failures aren't cached.
_cache: dict[str, int] = {}


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 2)}|{round(lon, 2)}"


def _params(lat: float, lon: float) -> dict[str, str]:
    return {
        "geometry": json.dumps(
            {"x": round(lon, 4), "y": round(lat, 4), "spatialReference": {"wkid": 4326}}
        ),
        "geometryType": "esriGeometryPoint",
        "returnGeometry": "false",
        "f": "json",
    }


def categorize(code: int | None) -> str | None:
    """Turn a land-cover code into a fuel category, or None where there is no data.

    The four developed classes stay separate. Parks and lawns really do burn, while
    downtown has almost nothing to burn. Lumping them together is what made the model
    call dense cities dangerous."""
    if code is None:
        return None
    if code in (11, 12):
        return "water"
    if code == 21:
        return "developed_open"
    if code == 22:
        return "developed_low"
    if code == 23:
        return "developed_med"
    if code == 24:
        return "developed_high"
    if code == 31:
        return "barren"
    if 41 <= code <= 43:
        return "forest"
    if code in (51, 52):
        return "shrub"
    if 71 <= code <= 74:
        return "grassland"
    if code in (81, 82):
        return "cropland"
    if code in (90, 95):
        return "wetland"
    return None


def _parse_value(raw: Any) -> int | None:
    """The server sends the pixel value as a string, or the word NoData."""
    try:
        code = int(float(raw))
    except (TypeError, ValueError):
        return None
    return code if code > 0 else None


def _code_from_response(data: dict[str, Any]) -> int | None:
    return _parse_value(data.get("value"))


async def land_cover_class(lat: float, lon: float) -> str | None:
    """The category at a point, or None if the lookup failed."""
    key = _grid_key(lat, lon)
    if key in _cache:
        return categorize(_cache[key])
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(IDENTIFY_URL, params=_params(lat, lon))
            resp.raise_for_status()
            code = _code_from_response(resp.json())
    except _NET_ERRORS as e:
        print(f"[landcover] upstream {type(e).__name__} for {lat},{lon}; returning None")
        return None
    if code is not None:
        _cache[key] = code
    return categorize(code)


def land_cover_class_cached(lat: float, lon: float, cache: dict[str, int]) -> str | None:
    """Same lookup, but synchronous and against a cache the caller owns and
    writes to disk. Only successes go in, so a re-run fills any gaps."""
    key = _grid_key(lat, lon)
    if key in cache:
        return categorize(cache[key])
    code: int | None = None
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(IDENTIFY_URL, params=_params(lat, lon))
            resp.raise_for_status()
            code = _code_from_response(resp.json())
    except _NET_ERRORS as e:
        print(f"[landcover] {lat},{lon}: {type(e).__name__}")
        code = None
    if code is not None:
        cache[key] = code
        time.sleep(0.05)  # be polite during bulk enrichment
    return categorize(code)

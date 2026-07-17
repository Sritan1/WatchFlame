"""NLCD land-cover lookup — the v2 "is there anything to burn?" feature.

Queries the National Land Cover Database via an ArcGIS ImageServer `identify`
point op (same ArcGIS-REST pattern as services/open_shelters.py) and collapses
the NLCD class code (0-95) into a small set of fuel categories. Gives the
ignition model a signal that an urban/water pixel won't ignite no matter how
hot/dry/windy it is — fixing the v1 over-flagging of low-fire regions.

Land cover is essentially static, so present-day NLCD is valid for historical
fires too, and results can be cached indefinitely. Graceful: returns None on
any failure or off-grid (e.g. offshore) point.

Two entry points share one mapping:
  * land_cover_class(lat, lon)            - async, for the live /ignition path
  * land_cover_class_cached(lat, lon, c)  - sync + disk-cache dict, for the
                                            one-time training enrichment
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

# EnviroAtlas-hosted NLCD 2019 (CONUS, 30 m). Verified: `identify` resolves a
# WGS84 point only when the SR is embedded in the geometry (not the inSR param).
IMAGESERVER = (
    "https://enviroatlas.epa.gov/arcgis/rest/services/"
    "Supplemental/nlcd_2019_landcover/ImageServer"
)
IDENTIFY_URL = f"{IMAGESERVER}/identify"

# Includes ValueError so a 200 with a non-JSON body (resp.json() decode failure)
# degrades to None like a network error, instead of escaping the handler.
_NET_ERRORS = (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError, ValueError)

# In-process cache of raw NLCD codes (land cover is static → no TTL). Caching
# codes (not categories) means a mapping change in categorize() needs no re-query.
# Only successful lookups are cached, so a transient failure is retried next time.
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
    """Map an NLCD class code into a fuel category, or None for no-data.

    Developed intensity is kept SEPARATE on purpose: open-space developed (21,
    grassy parks/lawns) genuinely burns, while high-intensity developed (24,
    dense urban / downtown) has almost no wildland fuel. Collapsing them hid
    that the over-flagged cities (Chicago = 24) are nothing like grassy 21."""
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
    """ImageServer returns the pixel value as a string ('24') or 'NoData'."""
    try:
        code = int(float(raw))
    except (TypeError, ValueError):
        return None
    return code if code > 0 else None


def _code_from_response(data: dict[str, Any]) -> int | None:
    return _parse_value(data.get("value"))


async def land_cover_class(lat: float, lon: float) -> str | None:
    """Live (async) land-cover category for a point, or None on failure."""
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
    """Sync land-cover lookup backed by a caller-owned dict of raw NLCD codes
    (persisted to disk by the training-enrichment script). Only successful
    lookups are cached so a re-run after a transient failure fills the gap."""
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

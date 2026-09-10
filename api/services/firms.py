import asyncio
import csv
import io
import os
import re
import time
from typing import Any

import httpx

from ..core import http
from ..core.parse import safe_float
from ..core.source_health import SourceUnavailable

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
# Remembers a recent outage so we don't hammer FIRMS while it is down. Separate
# from _CACHE, where an empty result is a real answer rather than a failure.
_FAIL_CACHE: dict[str, float] = {}

# area lands in the FIRMS URL path, so it can never be arbitrary text. Anything that
# isn't "world" or four numbers falls back to "world". The exponent part matters. A
# tiny bbox stringifies as "1e-05", and without it that becomes a request for Earth.
_NUM = r"-?\d{1,3}(?:\.\d+)?(?:[eE][+-]?\d+)?"
_BBOX_RE = re.compile(rf"^{_NUM}(?:,{_NUM}){{3}}$")

# Three satellites rather than one. Suomi NPP has gone empty for a whole day while
# NOAA-20 and 21 were still seeing active fires, and on one source that empties the
# map into a false all-clear.
_DEFAULT_SOURCES = ("VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA21_NRT")

# Rounding for the dedup. Three decimals is about 110m, well under the 375m VIIRS
# pixel, so it merges one fire seen three times without merging separate pixels
# along a fire front.
_DEDUP_DP = 3


def _ttl() -> int:
    return int(os.getenv("CACHE_TTL_SECONDS", "300"))


def _fail_ttl() -> int:
    # How long a total outage keeps us from trying again.
    return int(os.getenv("FIRMS_FAIL_CACHE_TTL_SECONDS", "60"))


def _sources() -> list[str]:
    """Which satellites to merge. FIRMS_SOURCES wins, the older singular
    FIRMS_SOURCE still works."""
    raw = os.getenv("FIRMS_SOURCES") or os.getenv("FIRMS_SOURCE")
    if raw:
        srcs = [s.strip() for s in raw.split(",") if s.strip()]
        if srcs:
            return srcs
    return list(_DEFAULT_SOURCES)


def _api_key() -> str:
    key = os.getenv("NASA_FIRMS_API_KEY")
    if not key:
        raise RuntimeError("NASA_FIRMS_API_KEY is not set; copy api/.env.example to api/.env")
    return key


def _parse_csv(text: str, source: str) -> list[dict[str, Any]]:
    """Turn a FIRMS CSV body into GeoJSON features.

    A bad key or blown quota comes back as HTTP 200 with a line of plain English. It
    parses to zero rows and looks exactly like "the satellites saw nothing". The
    giveaway is the missing header row, which a real empty result still has.
    """
    reader = csv.DictReader(io.StringIO(text))
    cols = reader.fieldnames or []
    if "latitude" not in cols or "longitude" not in cols:
        snippet = " ".join(text.split())[:120]
        print(f"[firms] {source}: non-CSV 200 body ({snippet!r}); reporting down")
        raise SourceUnavailable(f"firms {source}: unexpected non-CSV body")

    features: list[dict[str, Any]] = []
    for row in reader:
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
        except (KeyError, ValueError):
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "lat": lat,
                    "lon": lon,
                    "brightness": safe_float(row.get("bright_ti4") or row.get("brightness")),
                    "confidence": row.get("confidence"),
                    "acq_date": row.get("acq_date"),
                    "acq_time": row.get("acq_time"),
                    "satellite": row.get("satellite"),
                    "frp": safe_float(row.get("frp")),
                    "daynight": row.get("daynight"),
                },
            }
        )
    return features


async def _fetch_source(source: str, area: str, days: int) -> list[dict[str, Any]]:
    """Fetch and parse one satellite's feed."""
    # The API key sits in this URL, so never log it. core/logging_setup is the
    # backstop.
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{_api_key()}/{source}/{area}/{days}"
    try:
        resp = await http.get(url, timeout=30)
        resp.raise_for_status()
        text = resp.text
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # FIRMS is flaky, and quota bursts come back as 400 rather than 429.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[firms] {source} upstream {status} for {area}/{days} ({type(e).__name__}); reporting down")
        raise SourceUnavailable(f"firms {source} area fetch failed") from e
    return _parse_csv(text, source)


def _dedup(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse detections at the same spot down to the brightest. Three satellites
    see one fire at near-identical coordinates, so the map would draw it thrice."""
    best: dict[tuple[float, float], dict[str, Any]] = {}
    for f in features:
        p = f["properties"]
        key = (round(p["lat"], _DEDUP_DP), round(p["lon"], _DEDUP_DP))
        cur = best.get(key)
        if cur is None or (p.get("brightness") or 0.0) > (cur["properties"].get("brightness") or 0.0):
            best[key] = f
    return list(best.values())


async def fetch_fires_geojson(days: int = 1, bbox: str | None = None) -> dict[str, Any]:
    """Recent fire detections from NASA FIRMS, as GeoJSON, merged and deduped.

    Raises only when every source fails. An outage and "the satellites saw nothing"
    both look like an empty collection, and the route has to tell them apart, so one
    surviving source counts as healthy.
    """
    area = bbox if bbox else "world"
    if area != "world" and not _BBOX_RE.match(area):
        area = "world"

    sources = _sources()
    cache_key = f"{'+'.join(sources)}|{area}|{days}"

    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    # Everything failed recently, so say down rather than hammering a quota-limited
    # FIRMS on every request.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("firms area fetch failed (cached)")

    # All at once, keeping whatever comes back. One failing can't sink the rest.
    results = await asyncio.gather(
        *(_fetch_source(s, area, days) for s in sources),
        return_exceptions=True,
    )
    merged: list[dict[str, Any]] = []
    any_ok = False
    for r in results:
        if isinstance(r, BaseException):
            continue  # already logged where it happened
        any_ok = True
        merged.extend(r)

    if not any_ok:
        # An outage, not a quiet sky.
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("all firms sources failed")

    _FAIL_CACHE.pop(cache_key, None)

    fc = {"type": "FeatureCollection", "features": _dedup(merged)}
    _CACHE[cache_key] = (now, fc)
    return fc

import asyncio
import csv
import io
import os
import re
import time
from typing import Any

import httpx

from ..core.parse import safe_float
from ..core.source_health import SourceUnavailable

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
# Short-lived negative cache so a FIRMS outage isn't re-hit on every request.
# Mirrors the census + openfema degraded caches; separate from _CACHE because a
# success there is a real (possibly empty) FeatureCollection, not an outage.
_FAIL_CACHE: dict[str, float] = {}

# Defense-in-depth: `area` is interpolated into the FIRMS URL path, so it must
# never be arbitrary text. Callers (the /fires route) already validate, but the
# service refuses anything that isn't "world" or four comma-separated numbers
# and falls back to "world" rather than building a URL from untrusted input.
# The optional [eE] exponent is required because the route formats coordinates
# with a plain f-string, so a near-zero bbox stringifies as "1e-05"; without it
# a legitimate tiny bbox would fail this allowlist and silently downgrade to a
# WORLD query (returning global fires). Still numeric-only — no injection risk.
_NUM = r"-?\d{1,3}(?:\.\d+)?(?:[eE][+-]?\d+)?"
_BBOX_RE = re.compile(rf"^{_NUM}(?:,{_NUM}){{3}}$")

# Default: MERGE three VIIRS NRT satellites instead of relying on one. Any single
# near-real-time product lags intermittently (Suomi-NPP notably has gone empty
# for a full day while NOAA-20/21 still saw active fires), and a lone source
# blanks the entire map on a false all-clear. Merging covers the gap; overlapping
# same-fire pixels are collapsed by _dedup below. Override via FIRMS_SOURCES
# (comma-separated) or the legacy single FIRMS_SOURCE.
_DEFAULT_SOURCES = ("VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA21_NRT")

# Coordinate rounding for cross-satellite dedup. 3 dp ≈ 110 m, comfortably under
# the 375 m VIIRS pixel, so it collapses the SAME detection reported by multiple
# satellites without merging genuinely distinct pixels along a fire front.
_DEDUP_DP = 3


def _ttl() -> int:
    return int(os.getenv("CACHE_TTL_SECONDS", "300"))


def _fail_ttl() -> int:
    # How long an all-sources FIRMS outage suppresses re-hitting the upstream.
    return int(os.getenv("FIRMS_FAIL_CACHE_TTL_SECONDS", "60"))


def _sources() -> list[str]:
    """The FIRMS satellite products to merge. FIRMS_SOURCES (comma-separated)
    wins; the legacy singular FIRMS_SOURCE is still honored; else the 3-VIIRS
    default."""
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
    """Parse a FIRMS area-CSV body into GeoJSON features.

    Raises SourceUnavailable when the 200 body is NOT the expected CSV. FIRMS
    returns HTTP 200 with a plaintext error ("Invalid MAP_KEY.", "You have
    exceeded your allocated transaction limit ...") for a bad key or blown quota.
    Fed straight to csv.DictReader that parses to zero rows and reads as a
    genuine "satellite saw nothing" — a silent, map-wide false all-clear. We
    detect it by the absence of the latitude/longitude header columns (a real
    empty result still carries the header row).
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
    """Fetch + parse one FIRMS source. Raises SourceUnavailable on a network
    error OR a non-CSV 200 body (bad key / blown quota — see _parse_csv)."""
    # NOTE: the API key is embedded in this URL path — never log `url`. Logging
    # below references only `source`/`area`/`days`. (The root logger also has a
    # redaction filter as a backstop; see core/logging_setup.)
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{_api_key()}/{source}/{area}/{days}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = resp.text
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # FIRMS is flaky: transaction-quota bursts return 400 (not 429), and
        # cold satellite-pass windows occasionally 5xx.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[firms] {source} upstream {status} for {area}/{days} ({type(e).__name__}); reporting down")
        raise SourceUnavailable(f"firms {source} area fetch failed") from e
    return _parse_csv(text, source)


def _dedup(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse detections that round to the same ~110 m coordinate, keeping the
    brightest representative. The same fire is seen by several satellites at
    near-identical coords, so a raw merge would show it 2-3x and waste the
    downstream brightest-first marker budget on duplicates. Keeping the brightest
    means that cap still surfaces the strongest pixel for each location."""
    best: dict[tuple[float, float], dict[str, Any]] = {}
    for f in features:
        p = f["properties"]
        key = (round(p["lat"], _DEDUP_DP), round(p["lon"], _DEDUP_DP))
        cur = best.get(key)
        if cur is None or (p.get("brightness") or 0.0) > (cur["properties"].get("brightness") or 0.0):
            best[key] = f
    return list(best.values())


async def fetch_fires_geojson(days: int = 1, bbox: str | None = None) -> dict[str, Any]:
    """
    Fetch recent fire detections from NASA FIRMS and return GeoJSON.

    Merges several VIIRS NRT satellites (see _sources) so one satellite's NRT
    processing lag can't blank the map, then dedups overlapping same-fire pixels
    (see _dedup).

    Raises SourceUnavailable only when EVERY source fails (network error, quota
    burst, 5xx, timeout, or a non-CSV 200 error body) so the /fires route can
    report firms=down — a real outage returns the same empty FeatureCollection as
    "satellite saw nothing," and the two must be told apart. If at least one
    source succeeds, its detections are returned (partial coverage beats a false
    outage). A successful-but-empty result is NOT an outage and returns normally.

    FIRMS area API:
      https://firms.modaps.nasa.gov/api/area/csv/<KEY>/<SOURCE>/<AREA>/<DAYS>
      AREA is "world" or "minLon,minLat,maxLon,maxLat".
    """
    area = bbox if bbox else "world"
    if area != "world" and not _BBOX_RE.match(area):
        # Untrusted/malformed input never reaches the URL path.
        area = "world"

    sources = _sources()
    cache_key = f"{'+'.join(sources)}|{area}|{days}"

    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    # A recent all-sources outage for this query? Signal `down` from the negative
    # cache instead of re-hitting a flaky / quota-limited FIRMS every request.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("firms area fetch failed (cached)")

    # Fetch every source concurrently; one source's failure must not sink the
    # others, so gather with return_exceptions and merge whatever succeeded.
    results = await asyncio.gather(
        *(_fetch_source(s, area, days) for s in sources),
        return_exceptions=True,
    )
    merged: list[dict[str, Any]] = []
    any_ok = False
    for r in results:
        if isinstance(r, BaseException):
            continue  # already logged inside _fetch_source / _parse_csv
        any_ok = True
        merged.extend(r)

    if not any_ok:
        # Every configured source failed — a real outage, not "saw nothing".
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("all firms sources failed")

    # Success (even if empty) — drop any stale failure marker for this query.
    _FAIL_CACHE.pop(cache_key, None)

    fc = {"type": "FeatureCollection", "features": _dedup(merged)}
    _CACHE[cache_key] = (now, fc)
    return fc

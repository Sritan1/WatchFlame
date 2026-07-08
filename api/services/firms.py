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


def _ttl() -> int:
    return int(os.getenv("CACHE_TTL_SECONDS", "300"))


def _fail_ttl() -> int:
    # How long a transient FIRMS outage suppresses re-hitting the upstream.
    return int(os.getenv("FIRMS_FAIL_CACHE_TTL_SECONDS", "60"))


def _source() -> str:
    return os.getenv("FIRMS_SOURCE", "VIIRS_SNPP_NRT")


def _api_key() -> str:
    key = os.getenv("NASA_FIRMS_API_KEY")
    if not key:
        raise RuntimeError("NASA_FIRMS_API_KEY is not set; copy api/.env.example to api/.env")
    return key


async def fetch_fires_geojson(days: int = 1, bbox: str | None = None) -> dict[str, Any]:
    """
    Fetch recent fire detections from NASA FIRMS area API and return GeoJSON.

    Raises SourceUnavailable when FIRMS itself FAILS (network error, quota
    burst, 5xx, timeout) so the /fires route can report firms=down — a real
    outage returns the same empty FeatureCollection as "satellite saw nothing,"
    and the two must be told apart. A successful-but-empty result is NOT an
    outage and returns normally.

    FIRMS area API:
      https://firms.modaps.nasa.gov/api/area/csv/<KEY>/<SOURCE>/<AREA>/<DAYS>
      AREA is "world" or "minLon,minLat,maxLon,maxLat".
    """
    area = bbox if bbox else "world"
    if area != "world" and not _BBOX_RE.match(area):
        # Untrusted/malformed input never reaches the URL path.
        area = "world"
    cache_key = f"{_source()}|{area}|{days}"

    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    # A recent outage for this query? Signal `down` from the negative cache
    # instead of re-hitting a flaky / quota-limited FIRMS on every request.
    failed_at = _FAIL_CACHE.get(cache_key)
    if failed_at is not None and now - failed_at < _fail_ttl():
        raise SourceUnavailable("firms area fetch failed (cached)")

    # NOTE: the API key is embedded in this URL path — never log `url`. Error
    # logging below intentionally references only `area`/`days`. (The root
    # logger also has a redaction filter as a backstop; see core/logging_setup.)
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{_api_key()}/{_source()}/{area}/{days}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = resp.text
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        # FIRMS is flaky: transaction-quota bursts return 400 (not 429), and
        # cold satellite-pass windows occasionally 5xx. Signal a real outage
        # (distinct from "satellite saw nothing") so /fires reports firms down,
        # and record a short-lived failure so we don't hammer it meanwhile.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[firms] upstream {status} for {area}/{days} ({type(e).__name__}); reporting down")
        _FAIL_CACHE[cache_key] = now
        raise SourceUnavailable("firms area fetch failed") from e

    # Success — drop any stale failure marker for this query.
    _FAIL_CACHE.pop(cache_key, None)

    features: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(text))
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

    fc = {"type": "FeatureCollection", "features": features}
    _CACHE[cache_key] = (now, fc)
    return fc



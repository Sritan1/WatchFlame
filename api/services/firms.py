import csv
import io
import os
import re
import time
from typing import Any

import httpx

from ..core.parse import safe_float

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

# Defense-in-depth: `area` is interpolated into the FIRMS URL path, so it must
# never be arbitrary text. Callers (the /fires route) already validate, but the
# service refuses anything that isn't "world" or four comma-separated numbers
# and falls back to "world" rather than building a URL from untrusted input.
_BBOX_RE = re.compile(r"^-?\d{1,3}(?:\.\d+)?(?:,-?\d{1,3}(?:\.\d+)?){3}$")


def _ttl() -> int:
    return int(os.getenv("CACHE_TTL_SECONDS", "300"))


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
        # cold satellite-pass windows occasionally 5xx. Treat any upstream
        # failure as "satellite saw nothing right now" so the app falls back
        # to its empty-state UI instead of a generic error toast.
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[firms] upstream {status} for {area}/{days} ({type(e).__name__}); returning empty")
        empty = {"type": "FeatureCollection", "features": []}
        # Cache the empty result for a short window so we don't hammer FIRMS
        # while it's degraded. Use a 60s sub-TTL via a sentinel timestamp.
        _CACHE[cache_key] = (now - max(_ttl() - 60, 0), empty)
        return empty

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



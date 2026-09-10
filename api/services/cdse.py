"""Sentinel-2 vegetation readings from ESA's free Copernicus portal.

Copernicus runs the Sentinel Hub APIs under license, so requests match those docs
and only the base URL differs. Uses the Statistical API, not Process, for one average
NDVI over a square kilometre instead of a raster. Both fetchers return -1 to 1, or
None when clouds left nothing usable.
"""

from __future__ import annotations

import asyncio
import os
import time
from datetime import date
from typing import Any

import httpx

from ..core import http

_AUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_STATISTICS_URL_PATH = "/api/v1/statistics"

# The free tier throttles hard. About 36 calls spaced 1.2s apart before the 429s
# start, so the real budget is under one a second. Copernicus limits requests per
# minute and processing units per minute separately, and blowing either returns a
# 429. 1.5s buys about a second per call on a cold location, at the cost of most of
# the margin that 2.5s left. Override with CDSE_MIN_REQUEST_INTERVAL_S if the 429s
# come back.
_MIN_REQUEST_INTERVAL_S = float(os.getenv("CDSE_MIN_REQUEST_INTERVAL_S", "1.5"))
_MAX_RETRIES_429 = int(os.getenv("CDSE_MAX_RETRIES_429", "4"))

# A line per request, so a long climatology run doesn't look like a hang.
_VERBOSE = os.getenv("CDSE_VERBOSE", "0") == "1"

# Half-width of the square we sample, about a kilometre. It stretches a little
# toward the poles, which is fine at GPS accuracy.
_BBOX_HALF_DEG = 0.009

# Sampling resolution in degrees, roughly 100m, so about 20 by 20 pixels across the
# box. Sentinel Hub only reads this as meters for projected coordinates.
_RES_DEG = 0.0009

# Sentinel-2 flew with one satellite until 2017, so start at 2018 for consistent
# revisit times.
_CLIMATOLOGY_YEARS = list(range(2018, 2026))

# Runs on their servers, returning NDVI plus a mask. The trusted scene classes are
# vegetation, bare soil, water and unclassified, so cloud, shadow, cirrus and snow
# stay out of the average.
_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "SCL"],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(s) {
  const usable = (s.SCL === 4 || s.SCL === 5 || s.SCL === 6 || s.SCL === 7);
  const nir = s.B08, red = s.B04;
  const ndvi = (nir + red > 0) ? (nir - red) / (nir + red) : 0;
  return {
    ndvi: [ndvi],
    dataMask: [usable ? 1 : 0]
  };
}
"""


_token_cache: dict[str, float | str] = {"token": "", "expires_at": 0.0}
_token_lock = asyncio.Lock()

# Lines the requests up one at a time and keeps a gap between them.
_request_lock = asyncio.Lock()
_last_request_at: float = 0.0


def _instance_url() -> str:
    return os.getenv("CDSE_INSTANCE_URL", "https://sh.dataspace.copernicus.eu")


def _client_id() -> str:
    v = os.getenv("CDSE_CLIENT_ID")
    if not v:
        raise RuntimeError("CDSE_CLIENT_ID is not set in api/.env")
    return v


def _client_secret() -> str:
    v = os.getenv("CDSE_CLIENT_SECRET")
    if not v:
        raise RuntimeError("CDSE_CLIENT_SECRET is not set in api/.env")
    return v


async def _get_token() -> str | None:
    """Get an access token, cached and renewed a minute before it expires.

    Any auth trouble returns None instead of raising. Vegetation is optional, so
    losing it costs the season multiplier rather than 500-ing Status and Safety.
    """
    now = time.time()
    cached = _token_cache.get("token")
    expires_at = _token_cache.get("expires_at", 0.0)
    if cached and isinstance(expires_at, float) and now < expires_at - 60:
        return str(cached)

    async with _token_lock:
        now = time.time()
        cached = _token_cache.get("token")
        expires_at = _token_cache.get("expires_at", 0.0)
        if cached and isinstance(expires_at, float) and now < expires_at - 60:
            return str(cached)

        try:
            resp = await http.post(
                _AUTH_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": _client_id(),
                    "client_secret": _client_secret(),
                },
                timeout=30,
            )
            resp.raise_for_status()
            body = resp.json()
            # Parse in here too. Some gateways hand back an error object
            # with a 200.
            token = body["access_token"]
            expires_in = float(body.get("expires_in", 3600))
        except Exception as e:  # noqa: BLE001 - losing auth must never crash /risk
            status = getattr(getattr(e, "response", None), "status_code", "n/a")
            print(f"[cdse] token/auth fetch failed ({status}, {type(e).__name__}); returning None")
            return None

        _token_cache["token"] = token
        _token_cache["expires_at"] = time.time() + expires_in
        return str(token)


def _bbox(lat: float, lon: float) -> list[float]:
    return [
        lon - _BBOX_HALF_DEG,
        lat - _BBOX_HALF_DEG,
        lon + _BBOX_HALF_DEG,
        lat + _BBOX_HALF_DEG,
    ]


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime(t))


def _build_payload(
    lat: float,
    lon: float,
    from_iso: str,
    to_iso: str,
    aggregation_days: int,
    max_cloud: int,
) -> dict[str, Any]:
    return {
        "input": {
            "bounds": {
                "bbox": _bbox(lat, lon),
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {"maxCloudCoverage": max_cloud},
                }
            ],
        },
        "aggregation": {
            "timeRange": {"from": from_iso, "to": to_iso},
            "aggregationInterval": {"of": f"P{aggregation_days}D"},
            "evalscript": _EVALSCRIPT,
            "resx": _RES_DEG,
            "resy": _RES_DEG,
        },
        "calculations": {"default": {}},
    }


async def _wait_for_slot() -> None:
    """Enforce the minimum interval between requests across all coroutines."""
    global _last_request_at
    async with _request_lock:
        now = time.monotonic()
        wait = _MIN_REQUEST_INTERVAL_S - (now - _last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_at = time.monotonic()


async def _post_statistics(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Send a statistics request, or None on failure. Waits its turn and backs off
    when throttled."""
    token = await _get_token()
    if token is None:
        return None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    url = _instance_url() + _STATISTICS_URL_PATH

    for attempt in range(_MAX_RETRIES_429 + 1):
        await _wait_for_slot()
        if _VERBOSE:
            print(f"[cdse] POST statistics (attempt {attempt + 1}/{_MAX_RETRIES_429 + 1})")
        try:
            resp = await http.post(url, json=payload, headers=headers, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 429 and attempt < _MAX_RETRIES_429:
                # Exponential, or whatever Retry-After asks for.
                retry_after = e.response.headers.get("Retry-After")
                try:
                    delay = float(retry_after) if retry_after else 2.0 * (2 ** attempt)
                except ValueError:
                    delay = 2.0 * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            body = ""
            try:
                body = e.response.text[:500]
            except Exception:  # noqa: BLE001
                body = ""
            print(f"[cdse] upstream {status} for statistics ({type(e).__name__}); body={body!r}")
            return None
        except (httpx.TimeoutException, httpx.TransportError) as e:
            print(f"[cdse] upstream transport-fail for statistics ({type(e).__name__}); returning None")
            return None
    return None


def _extract_mean(stats_json: dict[str, Any]) -> float | None:
    """One mean NDVI out of a statistics response, averaged across intervals by
    sample count, so months where the satellite saw the ground count more."""
    intervals = stats_json.get("data") or []
    weighted_sum = 0.0
    total_weight = 0
    for interval in intervals:
        try:
            stats = interval["outputs"]["ndvi"]["bands"]["B0"]["stats"]
        except (KeyError, TypeError):
            continue
        sample_count = int(stats.get("sampleCount", 0)) - int(stats.get("noDataCount", 0))
        if sample_count <= 0:
            continue
        mean = stats.get("mean")
        if mean is None:
            continue
        weighted_sum += float(mean) * sample_count
        total_weight += sample_count
    if total_weight == 0:
        return None
    return weighted_sum / total_weight


async def fetch_ndvi_current(lat: float, lon: float, days: int = 16) -> float | None:
    """Recent mean NDVI around a point. The default covers two Sentinel-2 passes,
    so even a cloudy region usually yields some clear pixels."""
    now = time.time()
    payload = _build_payload(
        lat=lat,
        lon=lon,
        from_iso=_iso(now - days * 86400),
        to_iso=_iso(now),
        aggregation_days=days,
        max_cloud=80,
    )
    js = await _post_statistics(payload)
    if js is None:
        return None
    return _extract_mean(js)


async def fetch_ndvi_climatology(
    lat: float,
    lon: float,
    month: int,
    years: list[int] | None = None,
) -> float | None:
    """What this month normally looks like here, one request per year, weighted by
    usable samples. Cache it hard, it only moves month to month."""
    if not 1 <= month <= 12:
        raise ValueError(f"month must be 1..12, got {month}")
    years_to_query = years if years is not None else _CLIMATOLOGY_YEARS

    means: list[tuple[float, int]] = []
    for year in years_to_query:
        end_month = month + 1 if month < 12 else 1
        end_year = year if month < 12 else year + 1
        from_iso = f"{year}-{month:02d}-01T00:00:00Z"
        to_iso = f"{end_year}-{end_month:02d}-01T00:00:00Z"
        # The interval has to fit inside the window or nothing comes back. A
        # hardcoded 31 killed every 30-day month and February, so the whole app
        # read "vegetation unavailable" for those months.
        window_days = (date(end_year, end_month, 1) - date(year, month, 1)).days
        payload = _build_payload(
            lat=lat,
            lon=lon,
            from_iso=from_iso,
            to_iso=to_iso,
            aggregation_days=window_days,
            max_cloud=60,
        )
        js = await _post_statistics(payload)
        if js is None:
            continue
        intervals = js.get("data") or []
        for interval in intervals:
            try:
                stats = interval["outputs"]["ndvi"]["bands"]["B0"]["stats"]
            except (KeyError, TypeError):
                continue
            sc = int(stats.get("sampleCount", 0)) - int(stats.get("noDataCount", 0))
            mn = stats.get("mean")
            if sc > 0 and mn is not None:
                means.append((float(mn), sc))

    if not means:
        return None
    total_w = sum(w for _, w in means)
    return sum(m * w for m, w in means) / total_w

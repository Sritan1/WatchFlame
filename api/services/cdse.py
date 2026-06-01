"""Copernicus Data Space Ecosystem (CDSE) — Sentinel Hub Statistical API client.

CDSE is ESA's free Sentinel-2 portal; it runs the Sentinel Hub APIs licensed
from Sinergise, so the request shape matches the Sentinel Hub docs exactly.
Only the base URL differs from a paid Sentinel Hub account.

We use the **Statistical API** (`/api/v1/statistics`) rather than the Process
API because we want a single aggregate number (mean NDVI over a 1 km bbox)
rather than a raster — Statistical API returns JSON with per-band stats,
no binary image parsing needed.

Two public fetchers:
  - fetch_ndvi_current(lat, lon)         → mean NDVI over the last ~16d
  - fetch_ndvi_climatology(lat, lon, m, years=None) → mean NDVI for
                                           calendar month m, averaged across
                                           the given years (default 2018–2025)

The live /risk path uses a 3-year climatology window (2023–2025) via the
cache wrapper in services/ndvi_cache.py — keeps cold-cache latency
manageable (3 CDSE calls vs. 8, each gated by the 2.5s rate-limit throttle).
The full 8-year default is reserved for the one-time regional re-calibration
job which can take its time. Both return a float in [-1, 1], or None if no
usable observations land in the requested window (heavy cloud cover, etc.).
Callers fall back to season_mult in that case.

Auth: OAuth2 client_credentials. Token is cached in-process until expiry.
"""

from __future__ import annotations

import asyncio
import os
import time
from datetime import date
from typing import Any

import httpx

_AUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_STATISTICS_URL_PATH = "/api/v1/statistics"

# CDSE free tier throttles aggressively. Observed: ~36 sustained 1.2s-spaced
# calls before 429s start hitting, suggesting a per-minute bucket tighter
# than 1 req/sec. 2.5s minimum interval (~24 req/min) seems to stay clear.
# Tunable via env if a paid plan or trial relaxes the limit.
_MIN_REQUEST_INTERVAL_S = float(os.getenv("CDSE_MIN_REQUEST_INTERVAL_S", "2.5"))
_MAX_RETRIES_429 = int(os.getenv("CDSE_MAX_RETRIES_429", "4"))

# Print one line per statistics POST so long climatology runs are visibly
# progressing (otherwise a minute of silence looks like a hang).
_VERBOSE = os.getenv("CDSE_VERBOSE", "0") == "1"

# 1 km buffer (~0.009° at the equator; widens slightly with latitude but
# good enough at GPS accuracy). Bbox is a square centered on lat/lon.
_BBOX_HALF_DEG = 0.009

# Spatial resolution for the aggregation, expressed in DEGREES because we
# use CRS84 (lat/lon). 0.0009° ≈ 100 m at the equator, giving ~20x20 pixels
# per 2 km bbox — fine enough for vegetation aggregation, cheap on PUs.
# (Sentinel Hub interprets resx/resy in the CRS's units; meters only for
# projected CRSs like EPSG:3857.)
_RES_DEG = 0.0009

# Climatology window — Sentinel-2 ran with only one satellite until 2017,
# so 2018+ gives consistent two-satellite revisits.
_CLIMATOLOGY_YEARS = list(range(2018, 2026))

# Evalscript: emit NDVI plus a dataMask so cloudy / saturated / shadow
# pixels are excluded from the Statistical API's mean. Sen2Cor SCL classes:
#   4 vegetation, 5 bare soil, 6 water, 7 unclassified  → trust
#   3 cloud shadow, 8/9 clouds, 10 thin cirrus, 11 snow → mask out
#
# Single input group (shorthand list of band names) — using the multi-group
# object form would require matching each group to a data source via id,
# which we don't need here. Defaults per-band: B04/B08 = REFLECTANCE,
# SCL = DN classification.
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


# ---- OAuth ------------------------------------------------------------------

_token_cache: dict[str, float | str] = {"token": "", "expires_at": 0.0}
_token_lock = asyncio.Lock()

# Rate-limit gate: serializes statistics requests across coroutines and
# enforces a minimum gap between consecutive POSTs.
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


async def _get_token() -> str:
    """Fetch + cache an OAuth access token. Refreshes 60s before expiry."""
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

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                _AUTH_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": _client_id(),
                    "client_secret": _client_secret(),
                },
            )
            resp.raise_for_status()
            body = resp.json()

        _token_cache["token"] = body["access_token"]
        _token_cache["expires_at"] = time.time() + float(body.get("expires_in", 3600))
        return str(_token_cache["token"])


# ---- Statistical API --------------------------------------------------------


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
    """POST a Statistical API request and return the parsed JSON, or None
    on upstream failure. Throttles via _wait_for_slot and retries on 429
    with exponential backoff. Non-429 errors are logged once and return
    None."""
    token = await _get_token()
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
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 429 and attempt < _MAX_RETRIES_429:
                # Exponential backoff: 2s, 4s, 8s, 16s. Honors Retry-After
                # header if upstream sends one.
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
    """Pull the single overall mean NDVI from a Statistical API response.

    Multiple intervals may exist when the caller requested year-by-year
    aggregation. We average their means weighted by sampleCount so
    months with more usable observations contribute more.
    """
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
    """Mean NDVI over the last `days` days for a 1 km bbox around lat/lon.

    16 days is two Sentinel-2 revisits — enough to almost always get at
    least some cloud-free pixels even in cloudier biomes.
    """
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
    """Mean NDVI for the given calendar month, averaged across the given
    years (defaults to 2018–2025).

    Issues one Statistical API request per year, then averages by
    usable-sample weight. Results should be cached aggressively by the
    caller (climatology only changes monthly). Smoke scripts can pass a
    shorter window like [2023, 2024, 2025] to keep the test fast.
    """
    if not 1 <= month <= 12:
        raise ValueError(f"month must be 1..12, got {month}")
    years_to_query = years if years is not None else _CLIMATOLOGY_YEARS

    means: list[tuple[float, int]] = []
    for year in years_to_query:
        end_month = month + 1 if month < 12 else 1
        end_year = year if month < 12 else year + 1
        from_iso = f"{year}-{month:02d}-01T00:00:00Z"
        to_iso = f"{end_year}-{end_month:02d}-01T00:00:00Z"
        # The aggregation interval MUST fit within the query window, or the
        # Statistical API returns zero intervals (no data). Months are 28-31
        # days, so a hardcoded 31 silently drops every 30-day month (Apr/Jun/
        # Sep/Nov) and February — manifesting as "vegetation unavailable" for
        # the whole month. Match the interval to the month's actual length.
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
        # Extract the per-year mean + its weight, accumulate.
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

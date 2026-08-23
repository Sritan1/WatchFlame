"""Weather-archive client for live requests, the drought half of the score.

Pulls a year of daily highs and rainfall, runs the KBDI integrator over it, and
returns today's value with the mean annual precipitation it used. Cached hard, as a
year-long integral barely moves in a day. Failures return None instead of raising.
"""
from __future__ import annotations

import os
import time
from datetime import date, timedelta
from typing import Any

import httpx

from ..core.kbdi import compute_kbdi_series

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WINDOW_DAYS = 365
ARCHIVE_LAG_DAYS = 6  # Open-Meteo Archive trails real-time by about 5 days


def _ttl() -> int:
    return int(os.getenv("KBDI_CACHE_TTL_SECONDS", str(6 * 3600)))


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}"


async def fetch_kbdi_today(lat: float, lon: float) -> dict[str, Any] | None:
    """Today's KBDI for the grid cell around a point, or None if the fetch
    failed. Comes with the precipitation and window it was computed from."""
    cache_key = _grid_key(lat, lon)
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    end = date.today() - timedelta(days=ARCHIVE_LAG_DAYS)
    start = end - timedelta(days=WINDOW_DAYS - 1)

    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_max,precipitation_sum",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(ARCHIVE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 that isn't JSON at all
    ) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[kbdi] upstream {status} for {lat},{lon} ({type(e).__name__}); returning None")
        return None

    daily = data.get("daily") or {}
    temps_raw: list[float | None] = daily.get("temperature_2m_max") or []
    precs_raw: list[float | None] = daily.get("precipitation_sum") or []
    if len(temps_raw) < 30 or len(precs_raw) < 30:
        # Too little history to settle the integrator.
        print(f"[kbdi] sparse archive response for {lat},{lon} (n={len(temps_raw)}); skipping")
        return None
    if len(temps_raw) != len(precs_raw):
        # Arrays of different lengths would make the integrator raise.
        print(
            f"[kbdi] misaligned archive arrays for {lat},{lon} "
            f"(temps={len(temps_raw)}, precs={len(precs_raw)}); skipping"
        )
        return None

    # Missing days come back null, so fill them before the integrator sees them.
    last_t = 15.0
    temps: list[float] = []
    for v in temps_raw:
        if v is None:
            temps.append(last_t)
        else:
            last_t = float(v)
            temps.append(last_t)
    precs: list[float] = [float(v) if v is not None else 0.0 for v in precs_raw]

    mean_annual_mm = float(sum(precs))
    series = compute_kbdi_series(temps, precs, mean_annual_mm)

    out = {
        "kbdi": float(round(series[-1], 1)),
        "mean_annual_precip_mm": float(round(mean_annual_mm, 1)),
        "end_date": end.isoformat(),
        "n_days": len(series),
    }
    _CACHE[cache_key] = (now, out)
    return out


# Days since rain comes from the forecast endpoint, not the archive. The archive
# trails about six days, so rain this week is invisible to it, while the forecast
# endpoint hands back recent actuals with no lag. Separate cache and a shorter life,
# because this moves faster than a year-long integral.

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
RECENT_WINDOW_DAYS = 30
RAIN_THRESHOLD_MM = 1.0
_RECENT_CACHE: dict[str, tuple[float, int]] = {}


def _recent_ttl() -> int:
    # An hour. A stale "rained today" reads as wrong the next dry morning.
    return int(os.getenv("RECENT_PRECIP_CACHE_TTL_SECONDS", str(3600)))


async def fetch_days_since_rain_today(lat: float, lon: float) -> int | None:
    """How long since it last rained properly here, where 0 means today. None if
    the fetch failed, which callers can show as unknown."""
    cache_key = _grid_key(lat, lon)
    now = time.time()
    cached = _RECENT_CACHE.get(cache_key)
    if cached and now - cached[0] < _recent_ttl():
        return cached[1]

    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        # past_days gives real measurements through today. The forecast day is
        # required even though we ignore it, and asking for 0 errors out.
        "past_days": RECENT_WINDOW_DAYS,
        "forecast_days": 1,
        "daily": "precipitation_sum",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FORECAST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 that isn't JSON at all
    ) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(
            f"[recent_precip] upstream {status} for {lat},{lon} "
            f"({type(e).__name__}); returning None"
        )
        return None

    daily = data.get("daily") or {}
    times: list[str] = daily.get("time") or []
    precs_raw: list[float | None] = daily.get("precipitation_sum") or []
    if not times or not precs_raw:
        return None

    # Find today by date. The array also holds tomorrow's forecast.
    today_str = date.today().isoformat()
    today_idx = next((i for i, t in enumerate(times) if t == today_str), -1)
    if today_idx == -1:
        # Today is missing, probably station upload lag, so take the last real
        # day before anything future-dated.
        today_idx = len(times) - 1

    precs: list[float] = [float(v) if v is not None else 0.0 for v in precs_raw]

    days: int | None = None
    for i in range(today_idx, -1, -1):
        if precs[i] >= RAIN_THRESHOLD_MM:
            days = today_idx - i
            break
    if days is None:
        # No rain anywhere in the window, so report its full length. Otherwise
        # the slider would land on 0 and read as though it rained today.
        days = today_idx + 1

    _RECENT_CACHE[cache_key] = (now, days)
    return days

"""Hourly forecast weather for the trajectory index.

Pulls temperature, humidity, wind and precipitation for a point, cached on a coarse
grid so a whole metro area shares one call. Different endpoint from the archive KBDI
reads, with a less stressed quota. Failures return None instead of raising.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

from ..core import http

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# How far ahead the trajectory looks.
TRAJECTORY_HORIZON_HOURS = 6

HOURLY_VARIABLES = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
# The same fields for the `current` block, anchored to the location's own clock.
# Without it, "now" is the first hourly entry, which is local midnight.
CURRENT_VARIABLES = HOURLY_VARIABLES
# Today and tomorrow, so six hours past 23:00 still lands inside the array. With
# one day, opening the modal late at night gave identical now and projected frames.
FORECAST_DAYS = 2

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _ttl() -> int:
    # The forecast barely moves inside an hour, and the endpoint is rate-sensitive.
    return int(os.getenv("FORECAST_CACHE_TTL_SECONDS", str(3600)))


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}"


async def fetch_forecast_hourly(lat: float, lon: float) -> dict[str, Any] | None:
    """The hourly forecast for a point, or None if the fetch failed.

    Times are ISO strings in the location's own timezone, and every value array
    lines up with them by index.
    """
    cache_key = _grid_key(lat, lon)
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _ttl():
        return cached[1]

    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "hourly": HOURLY_VARIABLES,
        "current": CURRENT_VARIABLES,
        "forecast_days": FORECAST_DAYS,
        "timezone": "auto",
    }

    try:
        resp = await http.get(FORECAST_URL, params=params, timeout=15)
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
            f"[forecast] upstream {status} for {lat},{lon} "
            f"({type(e).__name__}); returning None"
        )
        return None

    hourly = data.get("hourly") or {}
    times: list[str] = hourly.get("time") or []
    if len(times) < TRAJECTORY_HORIZON_HOURS + 1:
        print(
            f"[forecast] sparse response for {lat},{lon} (n={len(times)}); skipping"
        )
        return None

    out = {
        "time": times,
        "temperature_2m": hourly.get("temperature_2m") or [],
        "relative_humidity_2m": hourly.get("relative_humidity_2m") or [],
        "wind_speed_10m": hourly.get("wind_speed_10m") or [],
        "precipitation": hourly.get("precipitation") or [],
        # The trajectory picks its "now" frame from this, then walks the hourly
        # array forward from there.
        "current": data.get("current") or None,
    }
    _CACHE[cache_key] = (now, out)
    return out

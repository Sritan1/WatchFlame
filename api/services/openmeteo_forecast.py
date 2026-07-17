"""Async Open-Meteo Forecast client for the Trajectory index.

Fetches the next 12 hours of hourly weather (temperature, humidity, wind,
precipitation) for a lat/lon and returns the now-vs-projected pair the
trajectory computation needs. Cached at the 0.1° grid for 1 hour so two
users at the same metro area share one upstream call.

This is a separate endpoint from the Archive client used for KBDI history
(see openmeteo_history.py). The Forecast API typically has a less-stressed
quota than the Archive — appropriate for the live-updating trajectory chip
that runs on every Status page load.

Graceful degrade: on any upstream failure we return None rather than
raising, mirroring the rest of the api/services pattern.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Horizon we project forward when computing the trajectory tier.
TRAJECTORY_HORIZON_HOURS = 6

# How many hourly samples to request — enough for the horizon plus a small
# buffer so we can pick the closest sample regardless of clock alignment.
HOURLY_VARIABLES = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
# Same variables for the `current` block — returns the current-hour values
# anchored to the location's actual local clock. Without this, "now" would
# be the first element of the hourly array (midnight of today), which is
# NOT the user's current real-time observation.
CURRENT_VARIABLES = HOURLY_VARIABLES
# 2 days = 48 hourly samples. Today + tomorrow gives us enough headroom to
# project +6 hr from any current hour (e.g. 23:00 + 6 hr = 05:00 tomorrow)
# without clamping to the end of today's array. forecast_days=1 was producing
# identical now/projected frames when the user opened the modal late at night.
FORECAST_DAYS = 2

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _ttl() -> int:
    # 1-hour TTL — forecast values shift slowly within an hour and the
    # endpoint is rate-sensitive. Override via env for testing.
    return int(os.getenv("FORECAST_CACHE_TTL_SECONDS", str(3600)))


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}"


async def fetch_forecast_hourly(lat: float, lon: float) -> dict[str, Any] | None:
    """Return {time: [...], temperature_2m: [...], relative_humidity_2m: [...],
    wind_speed_10m: [...], precipitation: [...]} from Open-Meteo's hourly
    Forecast endpoint, or None on upstream failure.

    The returned `time` array is ISO8601 strings in the location's local
    timezone (`timezone: "auto"`). All value arrays are aligned by index
    with `time`.
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
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FORECAST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 with a non-JSON body → resp.json() raises; degrade to None
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
        # `current` block — anchored at the user's actual current hour
        # (not the hourly array's index 0, which is midnight). Used by
        # the trajectory core to pick the "now" frame; the hourly array
        # is then used only to find the matching +6 hr index.
        "current": data.get("current") or None,
    }
    _CACHE[cache_key] = (now, out)
    return out

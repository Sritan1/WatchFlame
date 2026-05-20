"""Async Open-Meteo Archive client used at request time (not at notebook time).

Fetches 365 days of daily max-temp + precipitation for a lat/lon, runs the
KBDI series, and returns today's KBDI value plus the underlying mean annual
precipitation (handy for diagnostics and as a poor-man's climatology).

Heavy caching by design: KBDI walks change slowly (the integral averages out
single-day weather noise), so a 6-hour in-process TTL is plenty. The grid is
rounded to 0.1° (~7 mi at mid-latitudes) so two users in the same metro area
share one cache entry.

Open-Meteo Archive is free and unkeyed; the only failure modes are network
hiccups and the upstream returning a sparse/empty `daily` block for very
recent dates (their archive lags real-time by ~5 days). On any failure we
return None rather than raising, mirroring the firms.py "graceful degrade"
pattern so the /risk endpoint stays responsive.
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
ARCHIVE_LAG_DAYS = 6  # Open-Meteo Archive trails real-time by ~5 days


def _ttl() -> int:
    return int(os.getenv("KBDI_CACHE_TTL_SECONDS", str(6 * 3600)))


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}"


async def fetch_kbdi_today(lat: float, lon: float) -> dict[str, Any] | None:
    """Return {kbdi, mean_annual_precip_mm, end_date, n_days} for the grid
    cell containing (lat, lon), or None on upstream failure."""
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
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[kbdi] upstream {status} for {lat},{lon} ({type(e).__name__}); returning None")
        return None

    daily = data.get("daily") or {}
    temps_raw: list[float | None] = daily.get("temperature_2m_max") or []
    precs_raw: list[float | None] = daily.get("precipitation_sum") or []
    if len(temps_raw) < 30 or len(precs_raw) < 30:
        # Sparse response — not enough history to compute a stable KBDI.
        print(f"[kbdi] sparse archive response for {lat},{lon} (n={len(temps_raw)}); skipping")
        return None

    # Open-Meteo occasionally returns null for missing days; use simple
    # carry-forward / zero-fill so the integrator never sees a None.
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

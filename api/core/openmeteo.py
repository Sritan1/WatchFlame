"""Tiny Open-Meteo historical weather client used by the V2 validation notebook.

Free archive API, no key required:
    https://archive-api.open-meteo.com/v1/archive

For each fire we pull the 60 days ending on the fire's discovery date so we can
derive day-of-fire temperature, humidity, wind, and days_since_rain in one call.

Responses are cached to a JSON file so the notebook can be re-run without
re-hitting the API.
"""

from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterable

import httpx

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_PATH = _PROJECT_ROOT / "data" / "openmeteo_cache.json"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = "temperature_2m_max,wind_speed_10m_max,precipitation_sum"
HOURLY_VARS = "relative_humidity_2m"
TIMEZONE = "auto"


def _load_cache() -> dict[str, Any]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_cache(cache: dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")


def _key(lat: float, lon: float, end: date, days: int) -> str:
    return f"{round(lat, 3)}|{round(lon, 3)}|{end.isoformat()}|{days}"


def fetch_window(
    lat: float,
    lon: float,
    end_date: date,
    days: int = 60,
    cache: dict[str, Any] | None = None,
    polite_delay: float = 1.0,
    timeout: float = 20.0,
    retries: int = 3,
) -> dict[str, Any] | None:
    """Fetch `days+1` days of weather ending on `end_date` for one location.

    Returns the raw Open-Meteo JSON, or None on failure.
    """
    if cache is None:
        cache = _load_cache()
    k = _key(lat, lon, end_date, days)
    if k in cache:
        return cache[k]

    start = end_date - timedelta(days=days)
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lon, 3),
        "start_date": start.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": DAILY_VARS,
        "hourly": HOURLY_VARS,
        "timezone": TIMEZONE,
    }

    last_exc: Exception | None = None
    rate_limited = False
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(ARCHIVE_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                cache[k] = data
                if polite_delay:
                    time.sleep(polite_delay)
                return data
            if resp.status_code == 429:
                rate_limited = True
                time.sleep(2 ** attempt)
                continue
            last_exc = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            break
        except Exception as e:  # network error, retry
            last_exc = e
            time.sleep(2 ** attempt)

    if rate_limited and last_exc is None:
        # All retries returned 429. Do NOT cache None — rate limits are
        # transient, and caching would force a manual cleanup before any
        # future run could recover. Print so the eventual "0 fires for
        # {state}" message has a visible cause upstream.
        print(
            f"[openmeteo] rate-limited after {retries} attempts at "
            f"{lat:.3f},{lon:.3f} ({end_date.isoformat()}, days={days}); "
            f"not cached, will retry on next run"
        )
        # Long backoff so a quota-exhausted run doesn't burn through the
        # remaining fire list at full speed. Open-Meteo's per-minute window
        # sometimes clears on its own; 30s gives it a chance without making
        # the daily-cap case much worse (still bounded by 3 attempts above).
        time.sleep(30)
        return None

    if last_exc is not None:
        # Permanent-ish failure (4xx other than 429, network error, bad date).
        # Cache None so we don't retry forever.
        cache[k] = None
    return None


def summarize_window(
    raw: dict[str, Any] | None,
    fire_date: date,
) -> dict[str, float | int | None]:
    """Convert a raw window into the four scalars our risk algorithm needs.

    - temperature_c    : fire-day max temp
    - humidity_pct     : fire-day mean humidity (avg of hourly)
    - wind_kph         : fire-day max wind
    - days_since_rain  : count of consecutive days with precip < 1mm working
                         backwards from fire_date (inclusive of fire_date)
    """
    if raw is None:
        return {"temperature_c": None, "humidity_pct": None, "wind_kph": None,
                "days_since_rain": None}

    daily = raw.get("daily", {}) or {}
    times: list[str] = daily.get("time", []) or []
    temps: list[float | None] = daily.get("temperature_2m_max", []) or []
    winds: list[float | None] = daily.get("wind_speed_10m_max", []) or []
    precip: list[float | None] = daily.get("precipitation_sum", []) or []

    iso = fire_date.isoformat()
    if iso not in times:
        return {"temperature_c": None, "humidity_pct": None, "wind_kph": None,
                "days_since_rain": None}
    idx = times.index(iso)

    temp = temps[idx] if idx < len(temps) else None
    wind = winds[idx] if idx < len(winds) else None

    # days_since_rain: walk backwards from fire_date until precip >= 1mm
    days_since_rain: int | None = None
    for j in range(idx, -1, -1):
        p = precip[j] if j < len(precip) else None
        if p is None:
            continue
        if p >= 1.0:
            days_since_rain = idx - j
            break
    if days_since_rain is None and precip:
        # entire window dry → cap at window length
        days_since_rain = idx + 1

    # humidity: average hourly humidity for the fire date
    hourly = raw.get("hourly", {}) or {}
    h_times: list[str] = hourly.get("time", []) or []
    h_hum: list[float | None] = hourly.get("relative_humidity_2m", []) or []
    fire_iso_prefix = iso  # hourly times are "YYYY-MM-DDTHH:MM"
    hums: list[float] = []
    for t, h in zip(h_times, h_hum):
        if h is None:
            continue
        if t.startswith(fire_iso_prefix):
            hums.append(float(h))
    humidity = sum(hums) / len(hums) if hums else None

    return {
        "temperature_c": temp,
        "humidity_pct": humidity,
        "wind_kph": wind,
        "days_since_rain": days_since_rain,
    }


def enrich_iter(
    rows: Iterable[dict[str, Any]],
    cache: dict[str, Any] | None = None,
    on_progress=None,
) -> list[dict[str, Any]]:
    """Take dicts with lat, lon, fire_date (date) keys; yield the same dicts
    with the four real-weather scalars added. Persists cache after each call.
    """
    if cache is None:
        cache = _load_cache()
    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        d: date = row["fire_date"]
        raw = fetch_window(row["lat"], row["lon"], d, days=60, cache=cache)
        summary = summarize_window(raw, d)
        out.append({**row, **summary})
        if on_progress and (i + 1) % 25 == 0:
            on_progress(i + 1)
        if (i + 1) % 50 == 0:
            _save_cache(cache)
    _save_cache(cache)
    return out


# --- KBDI-enabled variants ----------------------------------------------------
#
# The 60-day window above is enough for days_since_rain but not for KBDI —
# KBDI integrates evaporation + rain over a year, so we pull 365-day windows.
# Keep these as separate functions so the V2 validation notebook (which uses
# the 60-day form for days_since_rain comparison) is unaffected.

def summarize_window_with_kbdi(
    raw: dict[str, Any] | None,
    fire_date: date,
) -> dict[str, float | int | None]:
    """Like summarize_window, but also runs the Keetch-Byram integrator over
    the full window and returns the KBDI value AT fire_date. Mean annual
    precipitation is approximated from the in-window total.
    """
    base = summarize_window(raw, fire_date)
    base["kbdi"] = None
    base["mean_annual_precip_mm"] = None
    if raw is None:
        return base

    daily = raw.get("daily", {}) or {}
    times: list[str] = daily.get("time", []) or []
    temps: list[float | None] = daily.get("temperature_2m_max", []) or []
    precs: list[float | None] = daily.get("precipitation_sum", []) or []

    iso = fire_date.isoformat()
    if iso not in times or len(temps) < 30 or len(precs) < 30:
        return base
    fire_idx = times.index(iso)

    # Carry-forward / zero-fill missing days so the integrator never sees None.
    last_t = 15.0
    t_filled: list[float] = []
    for v in temps:
        if v is None:
            t_filled.append(last_t)
        else:
            last_t = float(v)
            t_filled.append(last_t)
    p_filled: list[float] = [float(v) if v is not None else 0.0 for v in precs]

    # Local import keeps openmeteo.py importable without the api package
    # being on the Python path (notebooks/CLIs hit it both ways).
    from .kbdi import compute_kbdi_series

    mean_annual_mm = float(sum(p_filled))
    series = compute_kbdi_series(t_filled, p_filled, mean_annual_mm)
    base["kbdi"] = float(series[fire_idx])
    base["mean_annual_precip_mm"] = mean_annual_mm
    return base


def enrich_iter_kbdi(
    rows: Iterable[dict[str, Any]],
    cache: dict[str, Any] | None = None,
    on_progress=None,
    window_days: int = 365,
) -> list[dict[str, Any]]:
    """KBDI-enabled enrichment. Pulls a 365-day window per fire and adds
    `kbdi` + `mean_annual_precip_mm` alongside the four scalar weather fields.
    """
    if cache is None:
        cache = _load_cache()
    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        d: date = row["fire_date"]
        raw = fetch_window(row["lat"], row["lon"], d, days=window_days, cache=cache)
        summary = summarize_window_with_kbdi(raw, d)
        out.append({**row, **summary})
        if on_progress and (i + 1) % 25 == 0:
            on_progress(i + 1)
        if (i + 1) % 50 == 0:
            _save_cache(cache)
    _save_cache(cache)
    return out

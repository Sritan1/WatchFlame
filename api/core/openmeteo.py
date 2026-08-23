"""Small Open-Meteo archive client for the offline validation and calibration
scripts. Free, no key needed.

One call per fire covers the days up to its discovery date. Responses go into a
JSON cache so a re-run costs no quota.
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
    """Fetch days+1 days of weather ending on end_date, or None on failure."""
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
        except Exception as e:
            last_exc = e
            time.sleep(2 ** attempt)

    if rate_limited and last_exc is None:
        # Never cache a 429. It is temporary, and a cached None would need
        # hand-deleting before any later run could recover.
        print(
            f"[openmeteo] rate-limited after {retries} attempts at "
            f"{lat:.3f},{lon:.3f} ({end_date.isoformat()}, days={days}); "
            f"not cached, will retry on next run"
        )
        # Sit out so a quota-exhausted run doesn't tear through the rest of the
        # fire list. The per-minute window often clears in that time.
        time.sleep(30)
        return None

    if last_exc is not None:
        # Looks permanent, so cache the None and stop retrying it.
        cache[k] = None
    return None


def summarize_window(
    raw: dict[str, Any] | None,
    fire_date: date,
) -> dict[str, float | int | None]:
    """Reduce a raw window to the four numbers the risk algorithm wants. Fire-day max
    temp, mean hourly humidity, max wind, and days back to 1mm of rain."""
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

    # Walk back from the fire day until we hit 1mm of rain.
    days_since_rain: int | None = None
    for j in range(idx, -1, -1):
        p = precip[j] if j < len(precip) else None
        if p is None:
            continue
        if p >= 1.0:
            days_since_rain = idx - j
            break
    if days_since_rain is None and precip:
        # Never rained in the whole window, so cap at the window length.
        days_since_rain = idx + 1

    hourly = raw.get("hourly", {}) or {}
    h_times: list[str] = hourly.get("time", []) or []
    h_hum: list[float | None] = hourly.get("relative_humidity_2m", []) or []
    fire_iso_prefix = iso  # hourly stamps look like "YYYY-MM-DDTHH:MM"
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
    """Add the four weather numbers to dicts keyed lat, lon and fire_date."""
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


# KBDI integrates a year of rain and evaporation, so it needs a 365-day window
# where days_since_rain only needed 60. Separate function so callers wanting the
# cheap 60-day form still have it.

def summarize_window_with_kbdi(
    raw: dict[str, Any] | None,
    fire_date: date,
) -> dict[str, float | int | None]:
    """summarize_window plus the fire-day KBDI, from running the Keetch-Byram
    integrator over the window. Mean annual precip is the window total."""
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
    # The three daily arrays have to line up because the integrator needs equal
    # lengths. A short array from upstream gives a null KBDI, not an exception.
    if (
        iso not in times
        or len(temps) < 30
        or len(precs) < 30
        or len(times) != len(temps)
        or len(temps) != len(precs)
    ):
        return base
    fire_idx = times.index(iso)

    # Fill the gaps so the integrator never sees a None.
    last_t = 15.0
    t_filled: list[float] = []
    for v in temps:
        if v is None:
            t_filled.append(last_t)
        else:
            last_t = float(v)
            t_filled.append(last_t)
    p_filled: list[float] = [float(v) if v is not None else 0.0 for v in precs]

    # Local import so this module still loads when the api package isn't on the path.
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
    """enrich_iter on a 365-day window, adding kbdi and mean_annual_precip_mm."""
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

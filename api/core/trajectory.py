"""Trajectory index, the "is this getting worse?" signal next to the Status tier.

Projects the fire-weather score 6 hours out on Open-Meteo hourly data and calls it
rising, steady or falling. No I/O, so it unit-tests on synthetic windows.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .risk_algorithm import RiskResult, compute_risk, vapor_pressure_deficit_hpa
from .validation import doy_to_season

Tier = Literal["rising", "steady", "falling"]

# Score change that counts as a move rather than steady, same either direction.
SIGNIFICANT_DELTA_PCT = 10.0

# Mirrors openmeteo_forecast.TRAJECTORY_HORIZON_HOURS. Duplicated so the core math
# never imports the service layer.
HORIZON_HOURS = 6


@dataclass
class TrajectoryFrame:
    """One hour on the forecast trajectory."""
    label: str          # "now" or "+6 hr"
    temperature_c: float
    humidity_pct: float
    wind_kph: float
    precipitation_mm: float
    v4_score: float
    iso_time: str


@dataclass
class TrajectoryResult:
    tier: Tier
    delta_pct: float       # signed % change in v4_score (positive = rising)
    horizon_hours: int     # how far forward we projected
    now: TrajectoryFrame
    projected: TrajectoryFrame
    dominant_driver: str   # whichever of vpd, wind or humidity shifted most
    # Every hour from now to the horizon. frames[0] is now, the last is projected.
    frames: list[TrajectoryFrame]


def _pick_hour_index(times: list[str], from_iso: str | None, hours_ahead: int) -> int:
    """Index nearest from_iso + hours_ahead, clamped to the end of the array."""
    if not times:
        return 0
    if from_iso and from_iso in times:
        anchor_idx = times.index(from_iso)
    elif from_iso:
        # Match on the hour prefix so an added seconds or offset suffix still lands.
        # Exact matching anchored at midnight instead, the old pre-dawn bug.
        hour_key = from_iso[:13]
        anchor_idx = next((i for i, t in enumerate(times) if t[:13] == hour_key), 0)
    else:
        anchor_idx = 0
    target_idx = anchor_idx + hours_ahead
    return min(target_idx, len(times) - 1)


def _percent_change(now: float, projected: float) -> float:
    """Signed percent change, 0 near zero where the division blows up."""
    if abs(now) < 1e-3:
        return 0.0
    return ((projected - now) / now) * 100.0


def _build_frame(
    label: str,
    iso_time: str,
    temp_c: float,
    rh_pct: float,
    wind_kph: float,
    precip_mm: float,
    kbdi: float | None,
    ndvi_anomaly: float | None,
    season_for_iso: str,
) -> TrajectoryFrame:
    """Run compute_risk on the frame's weather and snapshot the score."""
    # Season from the date where possible, otherwise the caller's fallback.
    try:
        date_part = iso_time.split("T")[0]
        yr, mo, dy = (int(x) for x in date_part.split("-"))
        from datetime import date as _date
        doy = (_date(yr, mo, dy) - _date(yr, 1, 1)).days + 1
        season = doy_to_season(doy)
    except Exception:
        season = season_for_iso

    # The forecast says nothing about days since rain, so pass a neutral value.
    result: RiskResult = compute_risk(
        temp_c=float(temp_c),
        humidity_pct=float(rh_pct),
        wind_kph=float(wind_kph),
        days_since_rain=7,
        season=season,
        kbdi=kbdi,
        ndvi_anomaly=ndvi_anomaly,
    )
    return TrajectoryFrame(
        label=label,
        temperature_c=float(temp_c),
        humidity_pct=float(rh_pct),
        wind_kph=float(wind_kph),
        precipitation_mm=float(precip_mm),
        v4_score=result.score,
        iso_time=iso_time,
    )


def compute_trajectory(
    forecast: dict,
    kbdi: float | None = None,
    ndvi_anomaly: float | None = None,
    season_fallback: str = "summer",
    horizon_hours: int = HORIZON_HOURS,
) -> TrajectoryResult | None:
    """Compute the trajectory from an openmeteo_forecast.fetch_forecast_hourly dict.

    kbdi and ndvi_anomaly come from the /risk pipeline and stay fixed across the
    window because they move far slower than 6 hours. None if the arrays are too
    short or ragged to project.
    """
    times = forecast.get("time") or []
    temps = forecast.get("temperature_2m") or []
    rhs = forecast.get("relative_humidity_2m") or []
    winds = forecast.get("wind_speed_10m") or []
    precs = forecast.get("precipitation") or []

    if len(times) <= horizon_hours:
        return None
    if not (len(temps) == len(rhs) == len(winds) == len(precs) == len(times)):
        return None

    # Anchor "now" at the real current hour from the current block. The hourly
    # array starts at local midnight, so index 0 would report pre-dawn calm as the
    # user's afternoon weather.
    current = forecast.get("current") or {}
    current_iso = current.get("time") if isinstance(current, dict) else None
    now_idx = _pick_hour_index(times, current_iso, 0)

    # Open-Meteo returns null when a station didn't report, so borrow the nearest
    # value that exists.
    def _safe(arr: list, idx: int, fallback: float) -> float:
        v = arr[idx]
        if v is not None:
            return float(v)
        for j in range(idx - 1, -1, -1):
            if arr[j] is not None:
                return float(arr[j])
        for j in range(idx + 1, len(arr)):
            if arr[j] is not None:
                return float(arr[j])
        return fallback

    # A late-night "now" runs off the end of the array and repeats the final hour.
    frames: list[TrajectoryFrame] = []
    for h in range(horizon_hours + 1):
        idx = min(now_idx + h, len(times) - 1)
        frames.append(
            _build_frame(
                "now" if h == 0 else f"+{h} hr",
                times[idx],
                _safe(temps, idx, 20.0),
                _safe(rhs, idx, 50.0),
                _safe(winds, idx, 10.0),
                _safe(precs, idx, 0.0),
                kbdi,
                ndvi_anomaly,
                season_fallback,
            )
        )
    now_frame = frames[0]
    proj_frame = frames[horizon_hours]

    delta_pct = _percent_change(now_frame.v4_score, proj_frame.v4_score)
    if delta_pct >= SIGNIFICANT_DELTA_PCT:
        tier: Tier = "rising"
    elif delta_pct <= -SIGNIFICANT_DELTA_PCT:
        tier = "falling"
    else:
        tier = "steady"

    # Name whichever input moved most, so the UI can say what is driving the change.
    vpd_now = _vpd_proxy(now_frame.temperature_c, now_frame.humidity_pct)
    vpd_proj = _vpd_proxy(proj_frame.temperature_c, proj_frame.humidity_pct)
    deltas = {
        "vpd": abs(_percent_change(vpd_now, vpd_proj)),
        "wind": abs(_percent_change(now_frame.wind_kph, proj_frame.wind_kph)),
        "humidity": abs(_percent_change(now_frame.humidity_pct, proj_frame.humidity_pct)),
    }
    dominant_driver = max(deltas, key=lambda k: deltas[k])

    return TrajectoryResult(
        tier=tier,
        delta_pct=round(delta_pct, 1),
        horizon_hours=horizon_hours,
        now=now_frame,
        projected=proj_frame,
        dominant_driver=dominant_driver,
        frames=frames,
    )


def _vpd_proxy(temp_c: float, rh_pct: float) -> float:
    """VPD in hPa, only used to rank drivers. Delegates so the formula can't drift."""
    return vapor_pressure_deficit_hpa(temp_c, rh_pct)

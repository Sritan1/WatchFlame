"""Trajectory index — short-term forward-looking signal for the composite tier.

The Status composite tier is "now-only." It tells the user how dangerous
the current environment is, but not whether conditions are about to get
worse or better. Trajectory closes that gap by projecting the V4
fire-weather score 6 hours forward using Open-Meteo's hourly Forecast
data, and surfacing one of three tiers:

    rising   — projected score materially higher than now (deteriorating)
    steady   — projected within ±10% of now
    falling  — projected score materially lower than now (improving)

The "materially" threshold is a 10% delta in raw V4 score. That's roughly
the resolution at which a one-tier bucket shift becomes plausible, and
small enough that genuine direction is captured before it crosses a
boundary the user can act on.

Pure functions — no I/O, no FastAPI imports. Easy to unit-test against
synthetic forecast windows.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .risk_algorithm import RiskResult, compute_risk, vapor_pressure_deficit_hpa
from .validation import doy_to_season

Tier = Literal["rising", "steady", "falling"]

# Trajectory threshold — % change in raw V4 score that counts as a
# directional move rather than steady. Symmetric for rising and falling.
SIGNIFICANT_DELTA_PCT = 10.0

# Horizon we project forward. Mirrors openmeteo_forecast.TRAJECTORY_HORIZON_HOURS;
# kept here as a separate constant so the core math doesn't import the
# service layer.
HORIZON_HOURS = 6


@dataclass
class TrajectoryFrame:
    """A single point in time on the forecast trajectory — current or projected."""
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
    dominant_driver: str   # "vpd" / "wind" / "humidity" — what shifted most
    # Full hour-by-hour series from now out to the horizon (length
    # horizon_hours + 1). frames[0] IS `now` and frames[horizon_hours] IS
    # `projected` — so existing consumers are unaffected; the series just
    # additionally powers the hour-by-hour phase-space curve on the frontend.
    frames: list[TrajectoryFrame]


def _pick_hour_index(times: list[str], from_iso: str | None, hours_ahead: int) -> int:
    """Pick the array index closest to `from_iso + hours_ahead`. When
    from_iso is None, use the first element as anchor. Returns the index
    into `times`. Clamps to the last available index."""
    if not times:
        return 0
    if from_iso and from_iso in times:
        anchor_idx = times.index(from_iso)
    elif from_iso:
        # Tolerate minor format drift (a seconds / offset suffix) by matching on
        # the YYYY-MM-DDTHH hour prefix; only then fall back to index 0. An
        # exact-string-only match would silently anchor at midnight on any
        # format change, reintroducing the pre-dawn "now" bug.
        hour_key = from_iso[:13]
        anchor_idx = next((i for i, t in enumerate(times) if t[:13] == hour_key), 0)
    else:
        anchor_idx = 0
    target_idx = anchor_idx + hours_ahead
    return min(target_idx, len(times) - 1)


def _percent_change(now: float, projected: float) -> float:
    """Signed % change from `now` to `projected`. Returns 0 when `now` is
    near-zero to avoid division-by-near-zero blowup (a small absolute
    move there wouldn't be operationally meaningful anyway)."""
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
    # Best-effort season inference from the ISO date string. doy_to_season
    # wants a day-of-year integer; convert if we can, fall back to current
    # season as a last resort (irrelevant when NDVI is provided since
    # compute_risk prefers NDVI over season anyway).
    try:
        # ISO format "YYYY-MM-DDTHH:MM"
        date_part = iso_time.split("T")[0]
        yr, mo, dy = (int(x) for x in date_part.split("-"))
        from datetime import date as _date
        doy = (_date(yr, mo, dy) - _date(yr, 1, 1)).days + 1
        season = doy_to_season(doy)
    except Exception:
        season = season_for_iso  # passed-in fallback

    # The forecast doesn't tell us days-since-rain forward; use a neutral
    # value (the algorithm prefers KBDI anyway when supplied, and even
    # without KBDI a near-zero days-since-rain matches the typical recent
    # forecast). KBDI for the projected frame is approximated as today's
    # KBDI (it integrates slowly; 6 hours doesn't move it materially).
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
    """Compute the trajectory from a forecast dict (as returned by
    openmeteo_forecast.fetch_forecast_hourly).

    `kbdi` and `ndvi_anomaly` should be the user's current values from
    the /risk pipeline — we hold them constant for both the now-frame
    and the projected-frame since they move on timescales >> 6 hr.

    Returns None when the forecast doesn't have enough samples or the
    weather arrays are too sparse to project.
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

    # Anchor "now" at the user's ACTUAL current hour. Open-Meteo returns
    # the hourly array starting at midnight of today (local), so anchoring
    # at index 0 would silently use pre-dawn weather as "now" — that was
    # producing trajectories like "1.3 → 6.4 kph wind" because both
    # samples were nighttime calm, not the user's mid-afternoon reading.
    # When the response includes a `current` block, find the hourly index
    # whose `time` matches `current.time`; fall back to index 0 if no
    # match (preserves legacy / test behavior).
    current = forecast.get("current") or {}
    current_iso = current.get("time") if isinstance(current, dict) else None
    # Anchor "now" via the shared (format-tolerant) index helper rather than a
    # second inline match — keeps the projected-index logic and this one in sync.
    now_idx = _pick_hour_index(times, current_iso, 0)

    # Guard against any-null entries at the chosen indices — Open-Meteo
    # occasionally returns null for stations that didn't report. We
    # carry-forward from neighboring valid samples.
    def _safe(arr: list, idx: int, fallback: float) -> float:
        v = arr[idx]
        if v is not None:
            return float(v)
        # walk back to find a non-null
        for j in range(idx - 1, -1, -1):
            if arr[j] is not None:
                return float(arr[j])
        # walk forward
        for j in range(idx + 1, len(arr)):
            if arr[j] is not None:
                return float(arr[j])
        return fallback

    # Build the full hour-by-hour series from `now` out to the horizon.
    # Index h is clamped to the last sample so a late-night `now` that runs
    # off the end of the array carries the last value forward (matching the
    # old projected-clamp behavior). frames[0] is the now-frame and
    # frames[horizon_hours] is the projected-frame, so now/projected keep
    # their exact prior values.
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

    # Tier from signed score delta
    delta_pct = _percent_change(now_frame.v4_score, proj_frame.v4_score)
    if delta_pct >= SIGNIFICANT_DELTA_PCT:
        tier: Tier = "rising"
    elif delta_pct <= -SIGNIFICANT_DELTA_PCT:
        tier = "falling"
    else:
        tier = "steady"

    # Dominant driver: name the input whose % change contributed most
    # to the score shift. Helps the UI show "VPD up 18%" or "humidity
    # falling fast" — context the user can verify.
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
    """VPD in hPa, used here only to rank which driver moved most. Delegates to
    the canonical formula in risk_algorithm so the two can't drift (the prior
    'circular import' concern was unfounded — this module already imports from
    risk_algorithm)."""
    return vapor_pressure_deficit_hpa(temp_c, rh_pct)

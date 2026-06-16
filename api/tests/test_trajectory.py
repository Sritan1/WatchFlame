"""Tests for api/core/trajectory.py — pure-function trajectory computation."""
from __future__ import annotations

from api.core.trajectory import (
    HORIZON_HOURS,
    SIGNIFICANT_DELTA_PCT,
    _percent_change,
    _pick_hour_index,
    _vpd_proxy,
    compute_trajectory,
)


# ─── Helpers ─────────────────────────────────────────────────────────────


def _make_forecast(
    temps: list[float],
    rhs: list[float],
    winds: list[float],
    precs: list[float] | None = None,
) -> dict:
    """Build a forecast dict shaped like fetch_forecast_hourly's return."""
    n = len(temps)
    times = [f"2026-05-30T{h:02d}:00" for h in range(n)]
    return {
        "time": times,
        "temperature_2m": temps,
        "relative_humidity_2m": rhs,
        "wind_speed_10m": winds,
        "precipitation": precs if precs is not None else [0.0] * n,
    }


# ─── Pure helpers ────────────────────────────────────────────────────────


def test_percent_change_handles_near_zero():
    # Near-zero baseline shouldn't blow up to inf — small absolute moves
    # aren't operationally meaningful at that scale.
    assert _percent_change(0.0, 0.5) == 0.0
    assert _percent_change(0.0005, 1.0) == 0.0


def test_percent_change_signed():
    assert _percent_change(1.0, 1.5) == 50.0
    assert _percent_change(1.0, 0.5) == -50.0
    assert _percent_change(1.0, 1.0) == 0.0


def test_pick_hour_index_anchors_at_zero_when_no_iso():
    times = [f"2026-05-30T{h:02d}:00" for h in range(12)]
    assert _pick_hour_index(times, None, 6) == 6


def test_pick_hour_index_clamps_to_last():
    times = [f"2026-05-30T{h:02d}:00" for h in range(5)]
    # Requesting +10 hr from index 0 in a 5-element array should clamp.
    assert _pick_hour_index(times, times[0], 10) == 4


def test_pick_hour_index_unknown_iso_falls_back_to_zero():
    times = [f"2026-05-30T{h:02d}:00" for h in range(12)]
    assert _pick_hour_index(times, "2099-01-01T00:00", 6) == 6


def test_pick_hour_index_tolerates_format_drift():
    """Regression: an exact-string-only match silently anchored 'now' at
    midnight whenever current.time wasn't byte-identical to an hourly slot
    (e.g. a seconds suffix). The hour-prefix fallback must still find the
    right hour."""
    times = [f"2026-05-30T{h:02d}:00" for h in range(12)]
    # current.time carrying a seconds suffix → must match hour 5, not fall to 0.
    assert _pick_hour_index(times, "2026-05-30T05:00:00", 0) == 5
    # and the +offset still applies from the matched anchor (clamped to last).
    assert _pick_hour_index(times, "2026-05-30T05:00:00", 6) == 11


def test_vpd_proxy_dry_air_is_higher_than_humid():
    dry = _vpd_proxy(35.0, 15.0)
    humid = _vpd_proxy(35.0, 85.0)
    assert dry > humid


# ─── compute_trajectory ──────────────────────────────────────────────────


def test_trajectory_steady_when_conditions_flat():
    # Same weather across 12 hr → score steady → tier = 'steady'.
    forecast = _make_forecast(
        temps=[25.0] * 12,
        rhs=[50.0] * 12,
        winds=[10.0] * 12,
    )
    result = compute_trajectory(forecast, kbdi=300.0, ndvi_anomaly=0.0)
    assert result is not None
    assert result.tier == "steady"
    assert abs(result.delta_pct) < SIGNIFICANT_DELTA_PCT
    assert result.horizon_hours == HORIZON_HOURS


def test_trajectory_rising_when_conditions_deteriorate():
    # Hot, dry, windy by hour 6 → score rises > 10% → tier = 'rising'.
    forecast = _make_forecast(
        temps=[20.0, 22.0, 24.0, 26.0, 28.0, 30.0, 35.0, 36.0, 37.0, 38.0, 38.0, 38.0],
        rhs=  [70.0, 65.0, 60.0, 55.0, 50.0, 45.0, 25.0, 22.0, 20.0, 18.0, 18.0, 18.0],
        winds=[5.0, 6.0, 7.0, 8.0, 10.0, 12.0, 20.0, 22.0, 24.0, 26.0, 26.0, 26.0],
    )
    result = compute_trajectory(forecast, kbdi=500.0, ndvi_anomaly=-0.05)
    assert result is not None
    assert result.tier == "rising"
    assert result.delta_pct > SIGNIFICANT_DELTA_PCT
    # The projected frame should be materially worse than the now frame.
    assert result.projected.v4_score > result.now.v4_score


def test_trajectory_falling_when_conditions_improve():
    # Hot/dry now, cool/wet by hour 6 → tier = 'falling'.
    forecast = _make_forecast(
        temps=[35.0, 33.0, 30.0, 27.0, 24.0, 22.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0],
        rhs=  [20.0, 25.0, 30.0, 35.0, 45.0, 55.0, 70.0, 75.0, 80.0, 85.0, 85.0, 85.0],
        winds=[25.0, 22.0, 18.0, 14.0, 10.0, 8.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0],
    )
    result = compute_trajectory(forecast, kbdi=300.0, ndvi_anomaly=0.0)
    assert result is not None
    assert result.tier == "falling"
    assert result.delta_pct < -SIGNIFICANT_DELTA_PCT
    assert result.projected.v4_score < result.now.v4_score


def test_trajectory_returns_none_on_sparse_forecast():
    # Fewer than horizon+1 samples → can't project → None.
    forecast = _make_forecast(temps=[25.0, 26.0], rhs=[50.0, 50.0], winds=[10.0, 10.0])
    assert compute_trajectory(forecast) is None


def test_trajectory_returns_none_on_mismatched_arrays():
    # If Open-Meteo returns inconsistent array lengths, refuse rather
    # than guess at alignment.
    forecast = {
        "time": ["2026-05-30T00:00"] * 12,
        "temperature_2m": [25.0] * 12,
        "relative_humidity_2m": [50.0] * 12,
        "wind_speed_10m": [10.0] * 6,  # short
        "precipitation": [0.0] * 12,
    }
    assert compute_trajectory(forecast) is None


def test_trajectory_handles_null_entries_via_carry_forward():
    # Open-Meteo can return null for unreported stations. We carry-forward
    # from neighboring valid samples rather than failing.
    forecast = _make_forecast(
        temps=[25.0, 26.0, None, None, 28.0, 29.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0],  # type: ignore[list-item]
        rhs=[50.0] * 12,
        winds=[10.0] * 12,
    )
    result = compute_trajectory(forecast, kbdi=300.0, ndvi_anomaly=0.0)
    assert result is not None
    # Indices 2 and 3 carry-forward from index 1's value (26.0), so the
    # now-frame at index 0 is 25.0 and the projected at index 6 is 30.0
    # — both real numbers, no NaN propagation.
    assert result.now.temperature_c == 25.0
    assert result.projected.temperature_c == 30.0


def test_trajectory_identifies_dominant_driver():
    # Wind doubles, humidity and VPD barely move → wind is the driver.
    forecast = _make_forecast(
        temps=[25.0] * 12,
        rhs=[50.0] * 12,
        winds=[5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 25.0, 25.0, 25.0, 25.0, 25.0, 25.0],
    )
    result = compute_trajectory(forecast, kbdi=300.0, ndvi_anomaly=0.0)
    assert result is not None
    assert result.dominant_driver == "wind"


def test_trajectory_respects_custom_horizon():
    # Use a 2-hour horizon; result.horizon_hours should reflect it.
    forecast = _make_forecast(
        temps=[20.0, 25.0, 30.0, 32.0, 34.0, 35.0, 35.0, 35.0],
        rhs=[60.0, 50.0, 40.0, 35.0, 30.0, 25.0, 25.0, 25.0],
        winds=[5.0, 8.0, 12.0, 15.0, 18.0, 20.0, 20.0, 20.0],
    )
    result = compute_trajectory(forecast, kbdi=400.0, ndvi_anomaly=0.0, horizon_hours=2)
    assert result is not None
    assert result.horizon_hours == 2
    # The +2hr projection should use index 2 (30C, 40% RH, 12 kph).
    assert result.projected.temperature_c == 30.0

"""Tests for the Keetch-Byram Drought Index (api/core/kbdi.py)."""
from __future__ import annotations

import pytest

from api.core.kbdi import (
    KBDI_MAX,
    KBDI_MIN,
    compute_kbdi_series,
    kbdi_drought_factor,
)


def test_input_length_mismatch_raises():
    with pytest.raises(ValueError):
        compute_kbdi_series([20.0, 22.0], [0.0], mean_annual_precip_mm=900.0)


def test_cold_winter_holds_q_steady():
    # A month of freezing weather with no rain. Nothing dries, so Q stays put.
    Q0 = 100.0
    series = compute_kbdi_series(
        daily_max_temp_c=[-5.0] * 30,
        daily_precip_mm=[0.0] * 30,
        mean_annual_precip_mm=900.0,
        initial_q=Q0,
    )
    assert all(abs(q - Q0) < 0.01 for q in series), \
        "no drying when below ~50°F + no rain → Q must not move"


def test_hot_dry_summer_climbs():
    # Two months of heat with no rain. Q should climb the whole way.
    series = compute_kbdi_series(
        daily_max_temp_c=[35.0] * 60,
        daily_precip_mm=[0.0] * 60,
        mean_annual_precip_mm=900.0,
        initial_q=0.0,
    )
    assert all(b >= a - 1e-9 for a, b in zip(series, series[1:])), \
        "Q must be non-decreasing under sustained hot+dry"
    assert series[-1] > 200.0, \
        "60 days of 35°C with no rain should push KBDI well into 'dry' range"


def test_big_rain_knocks_q_down():
    # Build up some drought, then dump a one-day deluge.
    dry = [35.0] * 30
    series_dry = compute_kbdi_series(dry, [0.0] * 30, mean_annual_precip_mm=900.0)
    Q_after_dry = series_dry[-1]
    assert Q_after_dry > 100.0  # drought has built up

    # 50mm of rain on day 31, well above the 0.20" interception.
    series = compute_kbdi_series(
        dry + [25.0],
        [0.0] * 30 + [50.0],
        mean_annual_precip_mm=900.0,
    )
    assert series[-1] < Q_after_dry - 100.0, \
        "a 50mm one-day storm must drop Q substantially below the post-drought level"


def test_antecedent_interception_threshold():
    # A light shower never reaches the soil, so Q should not move.
    light_rain_mm = [4.0]  # 4mm = 0.157", below 0.20" interception
    series = compute_kbdi_series(
        daily_max_temp_c=[10.0] + [10.0],
        daily_precip_mm=[0.0] + light_rain_mm,
        mean_annual_precip_mm=900.0,
        initial_q=300.0,
    )
    # The canopy ate the rain and it's too cold to dry, so Q stays near 300.
    assert abs(series[-1] - 300.0) < 1.0, \
        "rain below the 0.20\" interception threshold must not reduce Q"


def test_antecedent_cumulative_event():
    # Two rain days totalling 0.30". The second pushes the event past the 0.20"
    # interception line, so the excess reaches the soil.
    series = compute_kbdi_series(
        daily_max_temp_c=[10.0, 10.0, 10.0],
        # 0.10" with no net, then 0.20" giving 0.10" net, then dry.
        daily_precip_mm=[0.10 * 25.4, 0.20 * 25.4, 0.0],
        mean_annual_precip_mm=900.0,
        initial_q=300.0,
    )
    # A tenth of an inch reaches the soil, which drops Q by ten.
    assert series[1] < series[0] - 5.0, \
        "cumulative rainfall above 0.20\" must reduce Q in subsequent steps"


def test_q_is_bounded():
    # Push hard against each bound separately.
    series_hot = compute_kbdi_series(
        [40.0] * 365, [0.0] * 365, mean_annual_precip_mm=200.0
    )
    series_wet = compute_kbdi_series(
        [10.0] * 30, [50.0] * 30, mean_annual_precip_mm=2000.0, initial_q=400.0
    )
    assert all(KBDI_MIN <= q <= KBDI_MAX for q in series_hot)
    assert all(KBDI_MIN <= q <= KBDI_MAX for q in series_wet)
    assert series_hot[-1] >= 600.0, "year of desert conditions should saturate KBDI high"
    assert series_wet[-1] < 200.0, "month of heavy rain should knock KBDI low"


def test_kbdi_drought_factor_endpoints():
    assert kbdi_drought_factor(KBDI_MIN) == pytest.approx(0.1, abs=1e-9)
    assert kbdi_drought_factor(KBDI_MAX) == pytest.approx(1.0, abs=1e-9)
    # Out-of-range inputs are clamped
    assert kbdi_drought_factor(-50.0) == pytest.approx(0.1, abs=1e-9)
    assert kbdi_drought_factor(2000.0) == pytest.approx(1.0, abs=1e-9)


def test_kbdi_drought_factor_is_monotone():
    samples = [0, 100, 200, 400, 600, 800]
    factors = [kbdi_drought_factor(q) for q in samples]
    assert all(b > a for a, b in zip(factors, factors[1:])), \
        "drought factor must be strictly increasing in KBDI"

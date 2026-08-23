"""Tests for the fire-weather index. Most assert the bucket, not a number. Anything
tied to a fitted constant reads it off DEFAULT_PARAMS so a re-fit doesn't break the
test."""

import math

import pytest

from api.core.risk_algorithm import (
    DEFAULT_PARAMS,
    compute_risk,
    saturation_vapor_pressure_hpa,
    vapor_pressure_deficit_hpa,
)


def test_low_risk_cool_humid_winter():
    r = compute_risk(temp_c=2, humidity_pct=90, wind_kph=5, days_since_rain=0, season="winter")
    assert r.level == "LOW"
    assert r.score < 0.15


def test_moderate_risk_mild_spring():
    r = compute_risk(temp_c=18, humidity_pct=50, wind_kph=12, days_since_rain=10, season="spring")
    assert r.level in ("LOW", "MODERATE")
    assert 0.15 <= r.score < 0.45


def test_high_risk_hot_dry_windy_summer():
    r = compute_risk(temp_c=35, humidity_pct=20, wind_kph=25, days_since_rain=30, season="summer")
    assert r.level in ("HIGH", "EXTREME")
    assert r.score >= 0.6


def test_extreme_risk_heatwave_drought():
    r = compute_risk(temp_c=42, humidity_pct=10, wind_kph=50, days_since_rain=60, season="summer")
    # Every factor pinned at or near its ceiling.
    assert r.level == "EXTREME"
    assert r.score >= 0.80


def test_saturation_vapor_pressure_at_25c():
    # Tetens / Magnus gives about 31.7 hPa at 25C.
    es = saturation_vapor_pressure_hpa(25.0)
    assert 31.0 < es < 32.5


def test_vpd_zero_when_saturated():
    # Saturated air pulls nothing out of the fuel, whatever the temperature.
    assert vapor_pressure_deficit_hpa(20.0, 100.0) == 0.0
    assert vapor_pressure_deficit_hpa(35.0, 100.0) == 0.0


def test_vpd_high_when_hot_and_dry():
    vpd = vapor_pressure_deficit_hpa(35.0, 15.0)
    assert 45 < vpd < 50


def test_humidity_input_is_clamped():
    r_neg = compute_risk(temp_c=20, humidity_pct=-10, wind_kph=10, days_since_rain=5, season="spring")
    r_high = compute_risk(temp_c=20, humidity_pct=200, wind_kph=10, days_since_rain=5, season="spring")
    assert r_neg.factors["vpd"] >= r_high.factors["vpd"]  # drier air, higher factor


def test_wind_factor_has_baseline_floor():
    # Fires happen on calm days, so at zero wind the factor sits at the fitted floor.
    r = compute_risk(temp_c=35, humidity_pct=20, wind_kph=0, days_since_rain=30, season="summer")
    assert r.factors["wind"] == pytest.approx(DEFAULT_PARAMS.wind_floor, abs=1e-4)
    assert r.score > 0.2


def test_wind_factor_saturates_at_high_speed():
    # Speeds above the fitted wind scale saturate to 1.0.
    r_60 = compute_risk(temp_c=25, humidity_pct=50, wind_kph=60, days_since_rain=10, season="summer")
    r_120 = compute_risk(temp_c=25, humidity_pct=50, wind_kph=120, days_since_rain=10, season="summer")
    assert r_60.factors["wind"] == 1.0
    assert r_120.factors["wind"] == 1.0


def test_wind_factor_is_monotone_in_speed():
    speeds = [0, 5, 10, 20, 30, 40]
    factors = [
        compute_risk(25, 50, s, 10, "summer").factors["wind"] for s in speeds
    ]
    for a, b in zip(factors, factors[1:]):
        assert a <= b


def test_drought_factor_has_baseline_floor():
    # A just-rained day shouldn't zero the score either.
    r = compute_risk(temp_c=35, humidity_pct=20, wind_kph=25, days_since_rain=0, season="summer")
    assert r.factors["drought"] >= 0.1


def test_drought_factor_saturates_around_60_days():
    f_60 = compute_risk(25, 50, 10, 60, "summer").factors["drought"]
    f_120 = compute_risk(25, 50, 10, 120, "summer").factors["drought"]
    assert f_60 > 0.95
    assert f_120 > 0.99


def test_season_ordering_winter_to_summer():
    common = dict(temp_c=25, humidity_pct=40, wind_kph=15, days_since_rain=10)
    s_winter = compute_risk(**common, season="winter").score
    s_spring = compute_risk(**common, season="spring").score
    s_summer = compute_risk(**common, season="summer").score
    s_fall = compute_risk(**common, season="fall").score
    assert s_winter < s_spring < s_fall <= s_summer


def test_factors_object_has_v2_keys():
    r = compute_risk(25, 40, 15, 7, "summer")
    assert set(r.factors.keys()) == {"vpd", "wind", "drought", "season"}
    for v in r.factors.values():
        assert 0.0 <= v <= 1.0


def test_score_always_in_unit_interval():
    for t in (-10, 0, 25, 45):
        for h in (0, 50, 100):
            for u in (0, 20, 60):
                for d in (0, 30, 90):
                    for s in ("winter", "spring", "summer", "fall"):
                        r = compute_risk(t, h, u, d, s)
                        assert 0.0 <= r.score <= 1.0, (t, h, u, d, s, r.score)
                        assert not math.isnan(r.score)


def test_kbdi_overrides_days_since_rain():
    common = dict(temp_c=30, humidity_pct=30, wind_kph=20, season="summer")
    # Same days since rain, wildly different KBDI, so the scores must differ.
    low_kbdi = compute_risk(**common, days_since_rain=5, kbdi=50)
    high_kbdi = compute_risk(**common, days_since_rain=5, kbdi=750)
    assert low_kbdi.factors["drought"] < high_kbdi.factors["drought"]
    assert low_kbdi.score < high_kbdi.score


def test_kbdi_drought_factor_matches_helper():
    from api.core.kbdi import kbdi_drought_factor

    r = compute_risk(temp_c=25, humidity_pct=40, wind_kph=10, days_since_rain=99, season="summer", kbdi=400)
    # compute_risk plumbs the fitted drought_floor into the helper.
    assert r.factors["drought"] == pytest.approx(
        kbdi_drought_factor(400, floor=DEFAULT_PARAMS.drought_floor), abs=1e-4
    )


def test_kbdi_none_falls_back_to_days_since_rain():
    a = compute_risk(temp_c=25, humidity_pct=40, wind_kph=10, days_since_rain=30, season="summer")
    b = compute_risk(temp_c=25, humidity_pct=40, wind_kph=10, days_since_rain=30, season="summer", kbdi=None)
    assert a.score == b.score
    assert a.factors == b.factors


def test_ndvi_anomaly_overrides_season_mult():
    from api.core.ndvi import ndvi_factor

    common = dict(temp_c=25, humidity_pct=40, wind_kph=15, days_since_rain=10)
    r = compute_risk(**common, season="spring", ndvi_anomaly=-0.10)
    assert r.factors["season"] == pytest.approx(ndvi_factor(-0.10), abs=1e-4)
    # Spring's calendar value is 0.80, and a dry reading has to beat it.
    assert r.factors["season"] > 0.80


def test_ndvi_negative_anomaly_raises_score_vs_neutral():
    common = dict(temp_c=30, humidity_pct=30, wind_kph=20, days_since_rain=15, season="summer")
    neutral = compute_risk(**common, ndvi_anomaly=0.0)
    stressed = compute_risk(**common, ndvi_anomaly=-0.15)
    assert stressed.score > neutral.score


def test_ndvi_none_uses_calendar_season():
    a = compute_risk(temp_c=25, humidity_pct=40, wind_kph=10, days_since_rain=30, season="fall")
    b = compute_risk(temp_c=25, humidity_pct=40, wind_kph=10, days_since_rain=30, season="fall", ndvi_anomaly=None)
    assert a.score == b.score
    assert a.factors == b.factors


def test_ndvi_zero_anomaly_uses_baseline_not_season():
    """A zero anomaly uses the ndvi_factor baseline of 0.80, not the calendar."""
    common = dict(temp_c=25, humidity_pct=40, wind_kph=15, days_since_rain=10)
    with_ndvi = compute_risk(**common, season="summer", ndvi_anomaly=0.0)
    without = compute_risk(**common, season="summer")
    # Summer's 1.0 beats the 0.80 baseline, so the calendar path scores higher.
    assert without.score > with_ndvi.score

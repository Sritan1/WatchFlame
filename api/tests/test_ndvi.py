"""Pure-function tests for core/ndvi.py — anomaly arithmetic and the
fire-weather factor mapping. No network, no fixtures."""

import pytest

from api.core.ndvi import ndvi_anomaly, ndvi_factor


# --- anomaly -----------------------------------------------------------------

def test_anomaly_sign_convention():
    # current LESS than climatology → negative anomaly (drier than normal)
    assert ndvi_anomaly(0.30, 0.50) == pytest.approx(-0.20)
    # current GREATER than climatology → positive anomaly (greener than normal)
    assert ndvi_anomaly(0.65, 0.50) == pytest.approx(0.15)
    # zero anomaly when current matches climatology exactly
    assert ndvi_anomaly(0.42, 0.42) == 0.0


# --- ndvi_factor -------------------------------------------------------------

def test_factor_neutral_at_zero_anomaly():
    """Zero anomaly = vegetation in its normal seasonal state → baseline 0.80."""
    assert ndvi_factor(0.0) == pytest.approx(0.80)


def test_factor_negative_anomaly_raises_factor():
    """Drier-than-normal (negative anomaly) should INCREASE the multiplier,
    which raises fire risk in compute_risk."""
    assert ndvi_factor(-0.05) > 0.80
    assert ndvi_factor(-0.10) > ndvi_factor(-0.05)


def test_factor_positive_anomaly_lowers_factor():
    """Greener-than-normal (positive anomaly) should DECREASE the multiplier."""
    assert ndvi_factor(0.05) < 0.80
    assert ndvi_factor(0.10) < ndvi_factor(0.05)


def test_factor_clamps_at_extremes():
    """Very large anomalies in either direction should saturate at the
    configured min/max (0.40 / 1.00)."""
    # Extreme drought stress (-0.50): factor should max out at 1.0.
    assert ndvi_factor(-0.50) == pytest.approx(1.00)
    # Extreme greenness (+0.50): factor should bottom out at 0.40.
    assert ndvi_factor(0.50) == pytest.approx(0.40)


def test_factor_monotonic_across_range():
    """Factor must be monotonically non-increasing in anomaly across the
    full plausible range. Catches sign or clamp regressions."""
    anomalies = [-0.30, -0.20, -0.10, -0.05, 0.0, 0.05, 0.10, 0.20, 0.30]
    factors = [ndvi_factor(a) for a in anomalies]
    for i in range(len(factors) - 1):
        assert factors[i] >= factors[i + 1], (
            f"non-monotonic: factor({anomalies[i]})={factors[i]} "
            f"< factor({anomalies[i + 1]})={factors[i + 1]}"
        )


def test_factor_stays_in_bounds():
    """For any plausible NDVI anomaly the factor must be in [0.40, 1.00]."""
    for a in [-1.0, -0.5, -0.2, -0.05, 0.0, 0.05, 0.2, 0.5, 1.0]:
        f = ndvi_factor(a)
        assert 0.40 <= f <= 1.00, f"factor({a})={f} out of bounds"

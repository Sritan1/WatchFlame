"""Pure-function tests for core/ndvi.py. No network, no fixtures."""

import pytest

from api.core.ndvi import ndvi_anomaly, ndvi_factor


def test_anomaly_sign_convention():
    # Below the norm is negative, so drier than usual.
    assert ndvi_anomaly(0.30, 0.50) == pytest.approx(-0.20)
    assert ndvi_anomaly(0.65, 0.50) == pytest.approx(0.15)
    assert ndvi_anomaly(0.42, 0.42) == 0.0


def test_factor_neutral_at_zero_anomaly():
    assert ndvi_factor(0.0) == pytest.approx(0.80)


def test_factor_negative_anomaly_raises_factor():
    assert ndvi_factor(-0.05) > 0.80
    assert ndvi_factor(-0.10) > ndvi_factor(-0.05)


def test_factor_positive_anomaly_lowers_factor():
    assert ndvi_factor(0.05) < 0.80
    assert ndvi_factor(0.10) < ndvi_factor(0.05)


def test_factor_clamps_at_extremes():
    assert ndvi_factor(-0.50) == pytest.approx(1.00)   # extreme drought stress
    assert ndvi_factor(0.50) == pytest.approx(0.40)    # extreme greenness


def test_factor_monotonic_across_range():
    """Catches a flipped sign or a broken clamp."""
    anomalies = [-0.30, -0.20, -0.10, -0.05, 0.0, 0.05, 0.10, 0.20, 0.30]
    factors = [ndvi_factor(a) for a in anomalies]
    for i in range(len(factors) - 1):
        assert factors[i] >= factors[i + 1], (
            f"non-monotonic: factor({anomalies[i]})={factors[i]} "
            f"< factor({anomalies[i + 1]})={factors[i + 1]}"
        )


def test_factor_stays_in_bounds():
    for a in [-1.0, -0.5, -0.2, -0.05, 0.0, 0.05, 0.2, 0.5, 1.0]:
        f = ndvi_factor(a)
        assert 0.40 <= f <= 1.00, f"factor({a})={f} out of bounds"

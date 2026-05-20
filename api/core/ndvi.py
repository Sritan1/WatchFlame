"""NDVI anomaly math + the fire-weather factor it produces.

NDVI anomaly = current NDVI − climatological (same-month) NDVI for the same
location. Captures how much DRIER (negative anomaly) or GREENER (positive)
vegetation is right now relative to its seasonal norm.

The factor `ndvi_factor(anomaly)` plays the same role in compute_risk that
the old hand-coded `_season_multiplier` did: a [0.4, 1.0] multiplier that
scales the multiplicative VPD·wind·drought product. The substitution
replaces a 4-bucket calendar guess with a real per-pixel vegetation-stress
measurement, the same variable USFS WFAS and similar operational systems
use as a fuel-load proxy.

When NDVI is unavailable (cloud cover, upstream failure, no lat/lon) the
caller falls back to `_season_multiplier(season)` — see risk_algorithm.py.

Calibration constants below are conservative defaults. The regional_thresholds
fitting (scripts/build_regional_thresholds.py) needs to re-run after this
substitution to re-align the LOW/MODERATE/HIGH/EXTREME boundaries with the
new score distribution.
"""

# Baseline factor at anomaly = 0 (vegetation in its normal seasonal state).
# Calibrated as the year-round average of the previous season_mult values
# (winter 0.4 + spring 0.8 + summer 1.0 + fall 0.9) / 4 = 0.775 ≈ 0.80.
_BASELINE = 0.80

# Slope: a unit anomaly change shifts the factor by this much. With slope=1.0
# a +0.10 NDVI deviation (mildly above-normal greenness) drops the factor by
# 0.10 to 0.70, and a -0.10 deviation (mild drought stress) raises it to 0.90.
# Clamps below at 0.40 (extreme greenness) and above at 1.00 (extreme stress).
_SLOPE = 1.0

_FACTOR_MIN = 0.40
_FACTOR_MAX = 1.00


def ndvi_anomaly(current: float, climatology: float) -> float:
    """Anomaly = current − climatology. Positive = greener than normal,
    negative = drier/sparser than normal."""
    return current - climatology


def ndvi_factor(anomaly: float) -> float:
    """Map an NDVI anomaly to a multiplicative fire-weather factor in
    [_FACTOR_MIN, _FACTOR_MAX]. Linear with a clamp at both ends.

    Sign convention: NEGATIVE anomaly (drier/sparser than normal) → HIGHER
    factor → higher fire risk. POSITIVE anomaly → lower factor → lower risk.
    """
    f = _BASELINE - _SLOPE * anomaly
    return max(_FACTOR_MIN, min(_FACTOR_MAX, f))

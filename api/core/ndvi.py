"""NDVI anomaly and the vegetation factor it feeds into the risk score.

The anomaly is current NDVI minus the same-month norm for that spot. ndvi_factor
turns it into the multiplier compute_risk uses instead of the calendar guess.
Change these constants and build_regional_thresholds.py has to be re-run.
"""

# Normal vegetation. The season multipliers average 0.775, rounded up so a neutral
# reading sits level with spring.
_BASELINE = 0.80

# At 1.0, a 0.10 NDVI deviation moves the factor 0.10 either way.
_SLOPE = 1.0

_FACTOR_MIN = 0.40
_FACTOR_MAX = 1.00


def ndvi_anomaly(current: float, climatology: float) -> float:
    """Positive means greener than normal, negative means drier than normal."""
    return current - climatology


def ndvi_factor(anomaly: float) -> float:
    """Vegetation factor from an NDVI anomaly. Drier than normal scores higher."""
    f = _BASELINE - _SLOPE * anomaly
    return max(_FACTOR_MIN, min(_FACTOR_MAX, f))

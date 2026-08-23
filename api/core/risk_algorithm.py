"""Fire-weather index. VPD, wind, drought and vegetation multiplied together.

Fosberg (Goodrick 2002), Tetens/Magnus VPD, Rothermel U^1.5 wind. RiskParams was
fit against an FPA-FOD hindcast, not picked by hand, in fit_fireweather_params.py.
The _bucket cutoffs only apply where a state has no calibration of its own.
"""

from dataclasses import dataclass
from math import exp
from typing import Literal

from .kbdi import kbdi_drought_factor
from .ndvi import ndvi_factor

Season = Literal["winter", "spring", "summer", "fall"]


# Rough fuel-load proxy. Winter is wet and dormant, summer and fall cured.
_SEASON_MULT: dict[Season, float] = {
    "winter": 0.4,
    "spring": 0.8,
    "summer": 1.0,
    "fall":   0.9,
}

# Drying constant for the days-since-rain fallback. Not fit. The hindcast runs on
# real KBDI and barely touches this path.
_DROUGHT_TAU_DAYS = 15.0


@dataclass(frozen=True)
class RiskParams:
    """Fitted constants. Only the weather drivers. The hindcast can't replay season
    or NDVI, so those stay module constants."""

    # These sum to 1.0, which keeps raw scores in [0, 1]. Drought is floored at 0.12
    # to keep KBDI load-bearing. Unconstrained, the fit pushed it to about 0.03.
    exp_vpd: float = 0.4534
    exp_wind: float = 0.4262
    exp_drought: float = 0.1204
    vpd_scale_hpa: float = 40.32    # 35C at 15% RH is about 48 hPa, saturating
    wind_scale_kph: float = 52.31
    # Floors keep a calm or post-rain day from collapsing the score.
    wind_floor: float = 0.0458
    drought_floor: float = 0.2786


DEFAULT_PARAMS = RiskParams()


@dataclass
class RiskResult:
    score: float
    level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"]
    factors: dict[str, float]


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(x, hi))


def saturation_vapor_pressure_hpa(t_c: float) -> float:
    """Tetens / Magnus saturation vapor pressure, hPa. Valid -40 to 50 C."""
    # Clamp to Earth extremes. A garbage temperature would hit the t = -237.3
    # singularity or overflow exp().
    t = _clamp(t_c, -90.0, 60.0)
    return 6.1078 * exp(17.27 * t / (t + 237.3))


def vapor_pressure_deficit_hpa(t_c: float, rh_pct: float) -> float:
    rh = _clamp(rh_pct, 0.0, 100.0)
    return saturation_vapor_pressure_hpa(t_c) * (1.0 - rh / 100.0)


def _vpd_factor(t_c: float, rh_pct: float, params: RiskParams = DEFAULT_PARAMS) -> float:
    return _clamp(vapor_pressure_deficit_hpa(t_c, rh_pct) / params.vpd_scale_hpa)


def _wind_factor(wind_kph: float, params: RiskParams = DEFAULT_PARAMS) -> float:
    u = max(0.0, wind_kph)
    base = (u / params.wind_scale_kph) ** 1.5
    floor = params.wind_floor
    return _clamp(floor + (1.0 - floor) * base, floor, 1.0)


def _drought_factor(days_since_rain: int, params: RiskParams = DEFAULT_PARAMS) -> float:
    d = max(0, days_since_rain)
    base = 1.0 - exp(-d / _DROUGHT_TAU_DAYS)
    floor = params.drought_floor
    return _clamp(floor + (1.0 - floor) * base, floor, 1.0)


def _season_multiplier(season: Season) -> float:
    return _SEASON_MULT[season]


def _bucket(score: float) -> Literal["LOW", "MODERATE", "HIGH", "EXTREME"]:
    if score < 0.3:
        return "LOW"
    if score < 0.6:
        return "MODERATE"
    if score < 0.8:
        return "HIGH"
    return "EXTREME"


def compute_risk(
    temp_c: float,
    humidity_pct: float,
    wind_kph: float,
    days_since_rain: int,
    season: Season,
    kbdi: float | None = None,
    ndvi_anomaly: float | None = None,
    params: RiskParams = DEFAULT_PARAMS,
) -> RiskResult:
    """Compute the fire-weather index.

    kbdi overrides days_since_rain, which stays for the slider calculator that has
    no location. ndvi_anomaly replaces the season multiplier, and the returned
    "season" factor holds whichever one was used.
    """
    vpd_f = _vpd_factor(temp_c, humidity_pct, params)
    wind_f = _wind_factor(wind_kph, params)
    if kbdi is not None:
        drought_f = kbdi_drought_factor(kbdi, floor=params.drought_floor)
    else:
        drought_f = _drought_factor(days_since_rain, params)
    if ndvi_anomaly is not None:
        seasonal_m = ndvi_factor(ndvi_anomaly)
    else:
        seasonal_m = _season_multiplier(season)

    raw = (vpd_f ** params.exp_vpd) * (wind_f ** params.exp_wind) * (drought_f ** params.exp_drought)
    score = _clamp(seasonal_m * raw)

    factors = {
        "vpd": round(vpd_f, 4),
        "wind": round(wind_f, 4),
        "drought": round(drought_f, 4),
        "season": round(seasonal_m, 4),
    }
    return RiskResult(score=round(score, 4), level=_bucket(score), factors=factors)

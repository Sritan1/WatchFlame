"""Fire weather index — V2 (multiplicative VPD-based).

Inputs: temperature (°C), relative humidity (%), wind (km/h), days_since_rain, season.
Output: a 0–1 fire weather severity score plus a four-bucket danger level.

Compared to V1 (additive 5-factor weighted sum), V2:

1. **Replaces separate temp + humidity factors with Vapor Pressure Deficit (VPD)** —
   the quantity used in modern operational fire weather products (NOAA HRRR-Smoke,
   Hot-Dry-Windy Index, Srock et al. 2018). VPD captures the actual physical driver
   of fuel drying: how much evaporative pull the air exerts on plant material.

   VPD (hPa) = e_s(T) · (1 − RH/100)
   e_s(T)    = 6.1078 · exp(17.27·T / (T + 237.3))      (Tetens / Magnus form)

2. **Wind as a power law** (U^1.5) instead of a 4-step ladder. Real fire spread
   scales roughly with wind^1–2 (Rothermel 1972). The power-law form eliminates
   threshold artifacts where 19 vs 20 kph caused a sudden score jump.

3. **Multiplicative combination** with log-space exponents that sum to 1.0:
       raw = vpd_factor^0.5 · wind_factor^0.3 · drought_factor^0.2
   This captures the well-established "hot AND dry AND windy" non-linearity:
   any single near-zero factor pulls the whole score down. Modeled on the
   structure of the Fosberg Fire Weather Index (Goodrick 2002).

4. **Exponential drought response** matching fine-fuel drying physics. Fine fuels
   (grass, leaves) approach equilibrium dryness in days, not months — V1's
   `min(days/60, 1)` saturated far too slowly.

5. **Wind and drought have a baseline floor** (0.2 and 0.1 respectively). Fires
   happen on calm days and after rain — pure multiplication would incorrectly
   collapse the score to 0. The floor preserves the multiplicative pull-down
   behavior without erasing risk under any single quiet condition.

Bucket boundaries (LOW < 0.3, MODERATE < 0.6, HIGH < 0.8, EXTREME ≥ 0.8) are
unchanged from V1 so danger-level UX stays consistent.
"""

from dataclasses import dataclass
from math import exp
from typing import Literal

from .kbdi import kbdi_drought_factor
from .ndvi import ndvi_factor

Season = Literal["winter", "spring", "summer", "fall"]


# Season acts as a coarse vegetation / fuel-load multiplier.
# Winter = wet, dormant biomass = low risk.
# Summer = dried-out cured fuel = high risk.
# Fall = still-dry cured fuel + frequent winds.
_SEASON_MULT: dict[Season, float] = {
    "winter": 0.4,
    "spring": 0.8,
    "summer": 1.0,
    "fall":   0.9,
}

# Calibration constants. Defensible defaults; tune against regional fire
# history if shipping to specific geographies.
_VPD_SCALE_HPA = 40.0       # 40 hPa ≈ extreme (e.g., 35°C/15% RH ≈ 48 hPa, saturates)
_WIND_SCALE_KPH = 40.0      # 40 kph saturates the wind contribution
_DROUGHT_TAU_DAYS = 15.0    # fine-fuel drying e-folding time

# Multiplicative exponents (log-space weights). Must sum to 1.0 to keep
# the raw score in [0, 1] when each factor is in [0, 1].
_EXP_VPD = 0.5
_EXP_WIND = 0.3
_EXP_DROUGHT = 0.2

# Lower bounds prevent score collapse on a calm or post-rain day —
# fires still happen under those conditions.
_WIND_FLOOR = 0.2
_DROUGHT_FLOOR = 0.1


@dataclass
class RiskResult:
    score: float
    level: Literal["LOW", "MODERATE", "HIGH", "EXTREME"]
    factors: dict[str, float]


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(x, hi))


def saturation_vapor_pressure_hpa(t_c: float) -> float:
    """Tetens / Magnus saturation vapor pressure, hPa. Valid −40 to 50 °C."""
    return 6.1078 * exp(17.27 * t_c / (t_c + 237.3))


def vapor_pressure_deficit_hpa(t_c: float, rh_pct: float) -> float:
    """VPD in hPa from temperature (°C) and relative humidity (%)."""
    rh = _clamp(rh_pct, 0.0, 100.0)
    return saturation_vapor_pressure_hpa(t_c) * (1.0 - rh / 100.0)


def _vpd_factor(t_c: float, rh_pct: float) -> float:
    return _clamp(vapor_pressure_deficit_hpa(t_c, rh_pct) / _VPD_SCALE_HPA)


def _wind_factor(wind_kph: float) -> float:
    u = max(0.0, wind_kph)
    base = (u / _WIND_SCALE_KPH) ** 1.5
    return _clamp(_WIND_FLOOR + (1.0 - _WIND_FLOOR) * base, _WIND_FLOOR, 1.0)


def _drought_factor(days_since_rain: int) -> float:
    d = max(0, days_since_rain)
    base = 1.0 - exp(-d / _DROUGHT_TAU_DAYS)
    return _clamp(_DROUGHT_FLOOR + (1.0 - _DROUGHT_FLOOR) * base, _DROUGHT_FLOOR, 1.0)


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
) -> RiskResult:
    """Compute the V2 fire weather index.

    `kbdi` (Keetch-Byram Drought Index, 0–800) is the preferred drought input
    when available — it's the operational metric the US Forest Service uses
    and integrates daily precip + ET history rather than relying on the
    cruder days-since-rain proxy. When `kbdi` is supplied it overrides
    `days_since_rain` for the drought factor; the latter is kept in the
    signature so the manual Risk Calculator (slider-driven, no GPS) and any
    legacy callers continue to work unchanged.

    `ndvi_anomaly` (current NDVI − same-month climatology) replaces the
    hand-coded calendar-based `season_mult` with a real per-pixel
    vegetation-stress measurement. Sign convention: NEGATIVE anomaly
    (drier/sparser than normal) → higher fire risk. When None, falls back
    to `season_mult(season)`. The dict returned under "season" still holds
    whatever multiplier was used, so callers don't need to branch.
    """
    vpd_f = _vpd_factor(temp_c, humidity_pct)
    wind_f = _wind_factor(wind_kph)
    if kbdi is not None:
        drought_f = kbdi_drought_factor(kbdi, floor=_DROUGHT_FLOOR)
    else:
        drought_f = _drought_factor(days_since_rain)
    # NDVI takes precedence over calendar season when available — it's a
    # measured signal, not a guess. The slot in `factors` is still named
    # "season" because that's its role in the formula (the seasonal/
    # vegetation multiplier); callers that need to know which source was
    # used can check whether they passed ndvi_anomaly themselves.
    if ndvi_anomaly is not None:
        seasonal_m = ndvi_factor(ndvi_anomaly)
    else:
        seasonal_m = _season_multiplier(season)

    raw = (vpd_f ** _EXP_VPD) * (wind_f ** _EXP_WIND) * (drought_f ** _EXP_DROUGHT)
    score = _clamp(seasonal_m * raw)

    factors = {
        "vpd": round(vpd_f, 4),
        "wind": round(wind_f, 4),
        "drought": round(drought_f, 4),
        "season": round(seasonal_m, 4),
    }
    return RiskResult(score=round(score, 4), level=_bucket(score), factors=factors)

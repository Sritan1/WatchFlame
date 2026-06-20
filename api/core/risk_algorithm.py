"""Fire weather index — V4 (multiplicative VPD × wind × KBDI × vegetation).

Inputs: temperature (°C), relative humidity (%), wind (km/h), days_since_rain,
season, and optionally KBDI (drought) + NDVI anomaly (vegetation stress).
Output: a 0–1 fire weather severity score plus a four-bucket danger level.

The structure is multiplicative — "hot AND dry AND windy AND drought-stressed":
any single near-zero factor pulls the whole score down. Modeled on the form of
the Fosberg Fire Weather Index (Goodrick 2002):

    raw   = vpd_f^a · wind_f^b · drought_f^c          (a + b + c = 1)
    score = vegetation_multiplier · raw

The factors:

1. **VPD** — Vapor Pressure Deficit, the evaporative pull the air exerts on
   fuel (NOAA HRRR-Smoke, Hot-Dry-Windy Index, Srock et al. 2018):
       VPD (hPa) = e_s(T) · (1 − RH/100)
       e_s(T)    = 6.1078 · exp(17.27·T / (T + 237.3))      (Tetens / Magnus)

2. **Wind** as a power law (U^1.5) — fire spread scales ~wind^1–2 (Rothermel
   1972). Continuous, so there are no threshold artifacts.

3. **Drought** — preferentially the Keetch-Byram Drought Index (KBDI) when
   available (see kbdi.py), the operational USFS drought integrator; falls back
   to an exponential days-since-rain response for the slider-driven calculator.

4. **Vegetation multiplier** — the NDVI anomaly factor (ndvi.py) when a live
   Sentinel-2 read is available, else the calendar season multiplier.

**Constants are fit, not hand-picked.** The exponents (a, b, c), VPD/wind
saturation scales, and floors live in `RiskParams` and were fit against a
500-fire FPA-FOD hindcast to maximize Spearman ρ(score, log fire size) on a
held-out test split — ρ improved from ~0.26 to ~0.32, edging out raw HDW and
Fosberg on the same fires. The vegetation/NDVI factor and calendar season
multipliers are held fixed (the hindcast can't replay historical NDVI, and
season is a selection proxy, not a weather driver). See
scripts/fit_v4_params.py and docs/ARCHITECTURE.md.

Raw 0–1 scores are re-bucketed per US state from fire-day score percentiles
(regional_calibration.py); the global LOW<0.3 / MOD<0.6 / EXT≥0.8 cutoffs are
only the fallback for uncalibrated locations.
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

# Fine-fuel drying e-folding time for the days_since_rain fallback drought
# path. Held fixed (not fit): the hindcast fits against real KBDI, so this
# constant is barely exercised. See scripts/fit_v4_params.py.
_DROUGHT_TAU_DAYS = 15.0


@dataclass(frozen=True)
class RiskParams:
    """Tunable calibration constants for the V4 fire-weather index.

    Defaults are the values fit against a 500-fire FPA-FOD hindcast
    (Spearman ρ on a held-out test split — see scripts/fit_v4_params.py).
    Pulling them into a dataclass lets the fitting harness sweep candidates
    while every production caller gets the fitted defaults via DEFAULT_PARAMS.

    Only the weather-driver constants live here. The vegetation/NDVI factor
    and the calendar season multipliers are held fixed (the hindcast can't
    exercise them — no historical Sentinel-2 replay, and season is a
    selection proxy not a weather driver), so they stay as module constants.

    The three exponents are log-space weights and should sum to 1.0 to keep
    the raw score in [0, 1] when each factor is in [0, 1].
    """

    # Multiplicative exponents (sum to 1.0). Wind and VPD carry the most
    # weight — the fit found fire SIZE is dominated by spread (wind) and
    # evaporative demand (VPD); drought was floored at 0.12 to keep KBDI
    # load-bearing (the unconstrained fit drove it to ~0.03 for only +0.006 ρ).
    exp_vpd: float = 0.4534
    exp_wind: float = 0.4262
    exp_drought: float = 0.1204
    # Saturation scales.
    vpd_scale_hpa: float = 40.32    # ~35°C/15% RH ≈ 48 hPa saturates
    wind_scale_kph: float = 52.31   # wind saturates later than V4's original 40
    # Lower bounds — prevent score collapse on a calm or post-rain day
    # (fires still happen under those conditions).
    wind_floor: float = 0.0458
    drought_floor: float = 0.2786


# The production parameter set. Every caller that doesn't pass `params`
# explicitly scores with these — so adopting a new fit is a one-line change
# to these defaults.
DEFAULT_PARAMS = RiskParams()


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
    vpd_f = _vpd_factor(temp_c, humidity_pct, params)
    wind_f = _wind_factor(wind_kph, params)
    if kbdi is not None:
        drought_f = kbdi_drought_factor(kbdi, floor=params.drought_floor)
    else:
        drought_f = _drought_factor(days_since_rain, params)
    # NDVI takes precedence over calendar season when available — it's a
    # measured signal, not a guess. The slot in `factors` is still named
    # "season" because that's its role in the formula (the seasonal/
    # vegetation multiplier); callers that need to know which source was
    # used can check whether they passed ndvi_anomaly themselves.
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

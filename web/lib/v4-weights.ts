// V4 fire-weather multiplicative exponents — the single frontend source of
// truth for the per-factor weights shown in the Risk Calculator and used to
// rank the dominant driver.
//
// These MIRROR the fitted `RiskParams` defaults in
// api/core/risk_algorithm.py (DEFAULT_PARAMS), which were fit against a
// 500-fire FPA-FOD hindcast (scripts/fit_v4_params.py). The backend is the
// authority — if the constants are ever re-fit, update these to match.
//
// Note: the score is a weighted *product* (vpd^a · wind^b · drought^c), not a
// weighted sum; these are log-space weights. The UI presents them as percent
// "weights" as an approachable simplification.

/** Exact exponents (sum ≈ 1.0). Use for ranking / math. */
export const V4_WEIGHTS = {
  vpd: 0.4534,
  wind: 0.4262,
  drought: 0.1204,
} as const;

/** Rounded whole-percent weights for display (sum = 100). */
export const V4_WEIGHT_PCT = {
  vpd: Math.round(V4_WEIGHTS.vpd * 100), // 45
  wind: Math.round(V4_WEIGHTS.wind * 100), // 43
  drought: Math.round(V4_WEIGHTS.drought * 100), // 12
} as const;

/** The rest of the fitted RiskParams — saturation scales, floors, and the
 *  days-since-rain drying time-constant. Same authority + sync rule as the
 *  exponents above. Kept here so every TS consumer (offline scorer, mocks)
 *  reads ONE copy. */
export const V4_SCALES = {
  vpdScaleHpa: 40.32,
  windScaleKph: 52.31,
  droughtTauDays: 15.0,
  windFloor: 0.0458,
  droughtFloor: 0.2786,
} as const;

/** Calendar-season vegetation multiplier, used when an NDVI anomaly isn't
 *  available. Mirrors api/core/risk_algorithm.py `_SEASON_MULT`. */
export const SEASON_MULT: Record<'winter' | 'spring' | 'summer' | 'fall', number> = {
  winter: 0.4,
  spring: 0.8,
  summer: 1.0,
  fall: 0.9,
};

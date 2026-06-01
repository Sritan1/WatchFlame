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

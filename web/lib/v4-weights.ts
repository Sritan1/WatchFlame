// The frontend's one copy of the fire-weather weights, mirroring DEFAULT_PARAMS in
// api/core/risk_algorithm.py. Re-fit there and these have to follow. The score is a
// product, not a sum, so these are exponents. The UI shows them as percentages.

/** The exact exponents. Use these for anything numeric. */
export const V4_WEIGHTS = {
  vpd: 0.4534,
  wind: 0.4262,
  drought: 0.1204,
} as const;

/** Whole percentages for display, adding to 100. */
export const V4_WEIGHT_PCT = {
  vpd: Math.round(V4_WEIGHTS.vpd * 100), // 45
  wind: Math.round(V4_WEIGHTS.wind * 100), // 43
  drought: Math.round(V4_WEIGHTS.drought * 100), // 12
} as const;

/** The rest of the fitted constants. Same rule, the backend owns them. Here so the
 *  offline scorer and the mocks read one copy. */
export const V4_SCALES = {
  vpdScaleHpa: 40.32,
  windScaleKph: 52.31,
  droughtTauDays: 15.0,
  windFloor: 0.0458,
  droughtFloor: 0.2786,
} as const;

/** Vegetation multiplier by season, for when there is no NDVI reading. */
export const SEASON_MULT: Record<'winter' | 'spring' | 'summer' | 'fall', number> = {
  winter: 0.4,
  spring: 0.8,
  summer: 1.0,
  fall: 0.9,
};

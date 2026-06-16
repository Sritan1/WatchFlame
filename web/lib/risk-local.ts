// Pure, client-side V4 fire-weather scorer — the single source of truth for
// computing a risk score from explicit inputs WITHOUT the backend.
//
// Why this exists: the Risk Calculator ("what-if") is a deterministic function
// of its slider inputs, so it shouldn't need a network round-trip per keystroke
// (and the README promises it "works fully offline"). This module mirrors
// api/core/risk_algorithm.py `compute_risk` exactly; the exponents come from
// v4-weights.ts (the existing single source) and the per-state calibration
// cutoffs from regional-thresholds.ts (bundled mirror of the backend JSON).
//
// The BACKEND remains the authority for the live Status/Safety/Map flows, which
// need real weather/KBDI/NDVI for the user's actual coordinates. This is only
// for the what-if calculator + anywhere a score must be computed offline.

import type { RegionalThresholds, RiskRequest, RiskResponse } from '@/lib/api';
import { thresholdsForState } from '@/lib/regional-thresholds';
import { SEASON_MULT, V4_SCALES, V4_WEIGHTS } from '@/lib/v4-weights';

// V4 saturation scales + floors now live in v4-weights.ts (the single TS source
// of truth for the fitted constants). Alias them to the local names this scorer
// already uses.
const {
  vpdScaleHpa: VPD_SCALE_HPA,
  windScaleKph: WIND_SCALE_KPH,
  droughtTauDays: DROUGHT_TAU_DAYS,
  windFloor: WIND_FLOOR,
  droughtFloor: DROUGHT_FLOOR,
} = V4_SCALES;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Tetens / Magnus saturation vapor pressure (hPa). Matches the backend. */
export function saturationVaporPressureHpa(tC: number): number {
  return 6.1078 * Math.exp((17.27 * tC) / (tC + 237.3));
}

export interface V4Factors {
  vpd: number;
  wind: number;
  drought: number;
  season: number;
}

/** Pure V4 factor + score computation from explicit physical inputs. Mirrors
 *  api/core/risk_algorithm.py `compute_risk`. */
export function scoreV4(input: {
  temperatureC: number;
  humidityPct: number;
  /** Wind in km/h (the wire contract — matches /risk + /weather). */
  windKph: number;
  /** KBDI 0–800 when known; null → fall back to the days-since-rain drying proxy. */
  kbdi: number | null;
  daysSinceRain: number;
  season: RiskRequest['season'];
  /** NDVI anomaly when known; null → fall back to the season multiplier. */
  ndviAnomaly: number | null;
}): { score: number; factors: V4Factors } {
  // VPD factor — Tetens / 40 hPa scale, clamped [0, 1].
  const vpdHpa =
    saturationVaporPressureHpa(input.temperatureC) *
    (1 - clamp(input.humidityPct, 0, 100) / 100);
  const vpdFactor = clamp01(vpdHpa / VPD_SCALE_HPA);

  // Wind factor — power law (kph/scale)^1.5 with floor.
  const windKph = Math.max(0, input.windKph);
  const windBase = Math.pow(windKph / WIND_SCALE_KPH, 1.5);
  const windFactor = clamp(WIND_FLOOR + (1 - WIND_FLOOR) * windBase, WIND_FLOOR, 1);

  // Drought factor — KBDI when supplied, else exponential drying from days-since-rain.
  let droughtFactor: number;
  if (input.kbdi != null) {
    droughtFactor = clamp(
      DROUGHT_FLOOR + (1 - DROUGHT_FLOOR) * (input.kbdi / 800),
      DROUGHT_FLOOR,
      1,
    );
  } else {
    const expBase = 1 - Math.exp(-Math.max(0, input.daysSinceRain) / DROUGHT_TAU_DAYS);
    droughtFactor = clamp(DROUGHT_FLOOR + (1 - DROUGHT_FLOOR) * expBase, DROUGHT_FLOOR, 1);
  }

  // Vegetation/season multiplier — NDVI anomaly overrides season when available.
  // Negative anomaly (drier than normal) → higher factor → higher risk.
  const seasonal =
    input.ndviAnomaly != null
      ? clamp(0.8 - input.ndviAnomaly, 0.4, 1)
      : SEASON_MULT[input.season];

  // V4 multiplicative combination (log-space exponents from v4-weights.ts).
  const raw =
    Math.pow(vpdFactor, V4_WEIGHTS.vpd) *
    Math.pow(windFactor, V4_WEIGHTS.wind) *
    Math.pow(droughtFactor, V4_WEIGHTS.drought);
  const score = clamp01(seasonal * raw);

  return {
    score,
    factors: { vpd: vpdFactor, wind: windFactor, drought: droughtFactor, season: seasonal },
  };
}

/** Global (uncalibrated) danger level. Cutoffs match the backend's global block. */
export function globalDangerLevel(score: number): RiskResponse['danger_level'] {
  if (score < 0.3) return 'LOW';
  if (score < 0.6) return 'MODERATE';
  if (score < 0.8) return 'HIGH';
  return 'EXTREME';
}

/** Bucket a score against a state's percentile thresholds. HIGH→EXTREME cuts at
 *  `extreme` (97th percentile); `high` (90th) is informational. Mirrors
 *  api/core/regional_calibration.py `_bucket`. */
export function regionalBucket(
  score: number,
  t: RegionalThresholds,
): RiskResponse['danger_level'] {
  if (score < t.low) return 'LOW';
  if (score < t.moderate) return 'MODERATE';
  if (score < t.extreme) return 'HIGH';
  return 'EXTREME';
}

/** Full offline equivalent of POST /risk for the what-if calculator. Pure and
 *  synchronous — no network. `req.state` selects the calibration thresholds
 *  from the bundled table (null → Global cutoffs). Returns the same
 *  RiskResponse shape the backend returns, so consumers are source-agnostic.
 *
 *  NOTE: intended for EXPLICIT slider inputs. It does not synthesize KBDI/NDVI
 *  from coordinates — that's a live-data concern the backend owns (the
 *  calculator seeds those values via the backend, then computes locally). */
export function computeRiskLocal(req: RiskRequest): RiskResponse {
  const { score, factors } = scoreV4({
    temperatureC: req.temperature,
    humidityPct: req.humidity,
    windKph: req.wind_speed,
    kbdi: req.kbdi ?? null,
    daysSinceRain: req.days_since_rain,
    season: req.season,
    ndviAnomaly: req.ndvi_anomaly ?? null,
  });

  const thresholds = thresholdsForState(req.state);
  const regionalLevel = thresholds ? regionalBucket(score, thresholds) : null;

  return {
    risk_score: Number(score.toFixed(4)),
    danger_level: globalDangerLevel(score),
    factors: {
      vpd: Number(factors.vpd.toFixed(4)),
      wind: Number(factors.wind.toFixed(4)),
      drought: Number(factors.drought.toFixed(4)),
      season: Number(factors.season.toFixed(4)),
    },
    regional_level: regionalLevel,
    regional_state: req.state ?? null,
    regional_thresholds: thresholds,
    kbdi: req.kbdi ?? null,
    ndvi_anomaly: req.ndvi_anomaly ?? null,
  };
}

// Client-side fire-weather scorer, so the what-if calculator doesn't need a network
// round trip per keystroke. Mirrors compute_risk in risk_algorithm.py, with
// exponents from v4-weights.ts and cutoffs from regional-thresholds.ts.

import type { RegionalThresholds, RiskRequest, RiskResponse } from '@/lib/api';
import { thresholdsForState } from '@/lib/regional-thresholds';
import { SEASON_MULT, V4_SCALES, V4_WEIGHTS } from '@/lib/v4-weights';

// Aliased to the names this scorer already used.
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

/** Tetens / Magnus saturation vapor pressure in hPa. The clamp mirrors the backend
 *  and keeps a wild temperature off the singularity at -237.3. */
export function saturationVaporPressureHpa(tC: number): number {
  const t = clamp(tC, -90, 60);
  return 6.1078 * Math.exp((17.27 * t) / (t + 237.3));
}

export interface V4Factors {
  vpd: number;
  wind: number;
  drought: number;
  season: number;
}

/** Score and factors from explicit weather inputs. Mirrors compute_risk. */
export function scoreV4(input: {
  temperatureC: number;
  humidityPct: number;
  /** Wind in km/h, matching what /risk and /weather send. */
  windKph: number;
  /** KBDI 0-800, or null to fall back on days since rain. */
  kbdi: number | null;
  daysSinceRain: number;
  season: RiskRequest['season'];
  /** NDVI anomaly, or null to fall back on the season multiplier. */
  ndviAnomaly: number | null;
}): { score: number; factors: V4Factors } {
  const vpdHpa =
    saturationVaporPressureHpa(input.temperatureC) *
    (1 - clamp(input.humidityPct, 0, 100) / 100);
  const vpdFactor = clamp01(vpdHpa / VPD_SCALE_HPA);

  const windKph = Math.max(0, input.windKph);
  const windBase = Math.pow(windKph / WIND_SCALE_KPH, 1.5);
  const windFactor = clamp(WIND_FLOOR + (1 - WIND_FLOOR) * windBase, WIND_FLOOR, 1);

  // KBDI if we have it, otherwise dry out exponentially from the last rain.
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

  // A measured NDVI anomaly beats the calendar. Drier than normal scores higher.
  const seasonal =
    input.ndviAnomaly != null
      ? clamp(0.8 - input.ndviAnomaly, 0.4, 1)
      : SEASON_MULT[input.season];

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

/** Uncalibrated danger level, on the backend's global cutoffs. */
export function globalDangerLevel(score: number): RiskResponse['danger_level'] {
  if (score < 0.3) return 'LOW';
  if (score < 0.6) return 'MODERATE';
  if (score < 0.8) return 'HIGH';
  return 'EXTREME';
}

/** Bucket a score against one state's thresholds, mirroring _bucket. The high
 *  threshold is informational and not a boundary. */
export function regionalBucket(
  score: number,
  t: RegionalThresholds,
): RiskResponse['danger_level'] {
  if (score < t.low) return 'LOW';
  if (score < t.moderate) return 'MODERATE';
  if (score < t.extreme) return 'HIGH';
  return 'EXTREME';
}

/** Offline stand-in for POST /risk, same response shape. Slider inputs only. It
 *  won't work KBDI or NDVI out from coordinates, that's the backend's job. The
 *  calculator seeds those once and computes here after. */
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

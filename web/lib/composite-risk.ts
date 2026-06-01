// Composite "Personal Threat" score.
//
// Combines two independent axes:
//   1. Fire-weather risk (calibration-aware normalization of the V4 score
//      through per-state regional thresholds). Answers "if a fire started
//      here today, how badly would it behave?"
//   2. Active-fire threat (distance + size of the worst nearby fire, with
//      wind alignment and time-decay modifiers). Answers "how exposed am
//      I to existing fires?"
//
// Both axes live in [0, 1] with each tier occupying exactly 0.25 of the
// output band (LOW [0, 0.25), MOD [0.25, 0.50), HIGH [0.50, 0.75),
// EXT [0.75, 1]). The composite is a simple weighted average that
// guarantees:
//   - Weather alone caps at 0.45 (deep MOD) → no false alarms when nothing
//     is actually burning. A worst-case fire-weather day for a calm state
//     (e.g. an EXT-for-FL day) still lands in deep MOD on the composite.
//   - Threat alone caps at 0.55 (HIGH bottom) → a close fire on a calm day
//     reaches "High Alert" but never crosses to EXT without dangerous
//     weather corroborating.
//   - Both axes peg → 1.0 EXT.
//
// All thresholds + constants live at the top of this file so the philosophy
// is in one place. Pure functions, no React, easy to unit-test.

import type {
  FireFeature,
  LatLon,
  NamedIncident,
  RegionalThresholds,
} from '@/lib/api';
import type { RiskLevel } from '@/lib/theme';

// ─── Tunables ─────────────────────────────────────────────────────────────

/** Weights for the final composite. Sum to 1.0 so no clamping needed. */
export const COMPOSITE_WEIGHTS = { weather: 0.45, threat: 0.55 } as const;

/** Decay constant for distance → threat. Chosen so 6 mi → 0.75 (EXT edge),
 *  12 mi → 0.56 (HIGH edge), 25 mi → 0.30 (MOD edge). Matches the discrete
 *  `threatLevelFor` bands within rounding. */
const DISTANCE_DECAY_MI = 21;

/** Fires below this acreage don't add to the size term. */
const SIZE_FLOOR_ACRES = 50;
/** Fires at or above this acreage produce the maximum size contribution.
 *  Raised from 1000 → 5000 so that "operationally large in CA" doesn't
 *  saturate the formula. With the old cap, ANY 1000+ ac fire pegged
 *  threat to 1.0 regardless of distance (since size_score=1.0 made the
 *  OR-aggregation ignore distance entirely). 5000 acres is a more honest
 *  threshold for "megafire that's threatening even from 30+ mi". */
const SIZE_CEILING_ACRES = 5000;

/** ±this many degrees from "wind blowing toward me" counts as alignment. */
const WIND_CONE_DEG = 30;
/** Below this wind speed (kph) we treat wind direction as noise. */
const WIND_CALM_KPH = 5;
/** Additive bump applied when wind aligns toward/away from user. */
const WIND_BUMP = 0.15;

/** FIRMS hits older than this are dampened (likely transient anomalies). */
const STALE_FIRMS_HOURS = 24;
/** Multiplier applied to stale FIRMS threat. */
const STALE_DAMPENER = 0.6;

/** Named-incident containment percentage at or above which we treat the
 *  fire as "mostly defeated" and dampen its threat contribution. 75% is
 *  the operational threshold most agencies use as "containment is holding". */
const CONTAINED_PCT_THRESHOLD = 75;
/** Multiplier applied to threat when the named incident is ≥ 75% contained.
 *  Same magnitude as STALE_DAMPENER — a contained fire and a stale satellite
 *  hit are similar "this is probably not actively threatening" signals. */
const CONTAINED_DAMPENER = 0.6;

/** Fires beyond this distance contribute < 0.10 to threat regardless of
 *  size, so we skip them to keep the aggregation loop tight. */
export const THREAT_RADIUS_MI = 50;

/** When the highest-threat fire is a FIRMS pixel, look for a named incident
 *  within this radius. If one exists, surface IT as the threat source
 *  instead of the satellite pixel — the named incident has richer metadata
 *  (name, acres, containment) and is the authoritative record for the same
 *  physical fire. Sized generously since FIRMS pixels are ~375m resolution
 *  and a single fire can spawn pixels spread across that footprint. */
const FIRMS_TO_INCIDENT_TIEBREAK_MI = 3;

/** Bucket edges for both inputs and the composite output. */
const BUCKET_EDGES = { low: 0.25, moderate: 0.5, high: 0.75 } as const;

/** Mirrors `_GLOBAL_FALLBACK` in api/core/regional_calibration.py. Used when
 *  the response carries no `regional_thresholds` (uncalibrated state, or a
 *  state where the JSON is missing required keys). Without this fallback the
 *  Status page would treat the raw V4 score as if it were already a 0-1
 *  percentile, which silently mis-buckets every uncalibrated location.
 *
 *  Must stay in lockstep with the backend's `_GLOBAL_FALLBACK` and the JSON
 *  data file's `global` block. extreme=0.8 is what the Risk Calculator's
 *  gauge has always shown; was previously misaligned at 1.0. */
const GLOBAL_FALLBACK_THRESHOLDS: RegionalThresholds = {
  low: 0.3,
  moderate: 0.6,
  high: 0.8, // unused for bucketing, kept for shape parity with backend
  extreme: 0.8,
  score_max: 1.0,
};

// ─── Public API ───────────────────────────────────────────────────────────

/** Map the V4 raw `risk_score` to [0, 1] using the region's percentile
 *  thresholds. Each tier occupies exactly 0.25 of the output range, so
 *  passing the result through `bucketOf(w)` is guaranteed to agree with
 *  the backend's `danger_level` (or `regional_level`).
 *
 *  Band boundaries mirror `_bucket` in api/core/regional_calibration.py:
 *    raw < t.low       → LOW
 *    raw < t.moderate  → MOD
 *    raw < t.extreme   → HIGH        (note: `t.high` is the 90th percentile
 *                                     stored for visualization only — it's
 *                                     NOT a bucket boundary; backend uses
 *                                     `t.extreme` = 97th percentile here)
 *    raw ≥ t.extreme   → EXT
 *
 *  This is the key calibration step. Without it, a humid state's worst-day
 *  score would normalize to a low fraction of score_max and the composite
 *  would collapse it to LOW even on a deep-EXT-for-that-state day. With it,
 *  that same day lands in the EXT band, and the formula then downgrades the
 *  composite cleanly to MOD because no fires are present. */
export function normalizeWeather(
  rawScore: number,
  t: RegionalThresholds | null | undefined,
): number {
  // Fall back to the same global thresholds the backend uses when the
  // response carries no per-state calibration. Without this, an uncalibrated
  // location would silently treat raw V4 as a 0-1 percentile.
  const thresholds = t && isThresholdsValid(t) ? t : GLOBAL_FALLBACK_THRESHOLDS;
  const { low, moderate, extreme, score_max } = thresholds;

  // NaN guard: a NaN rawScore would fall through every comparison below
  // (NaN < x is always false), produce NaN, then bucketOf(NaN) would
  // classify as 'extreme' and pin the orb to CRITICAL on bad data.
  if (!Number.isFinite(rawScore)) return 0;
  if (rawScore <= 0) return 0;
  // LOW band: [0, low) → [0, 0.25)
  if (rawScore < low) return (rawScore / low) * BUCKET_EDGES.low;
  // MOD band: [low, moderate) → [0.25, 0.5)
  if (rawScore < moderate)
    return BUCKET_EDGES.low + ((rawScore - low) / (moderate - low)) * 0.25;
  // HIGH band: [moderate, extreme) → [0.5, 0.75)
  if (rawScore < extreme)
    return (
      BUCKET_EDGES.moderate +
      ((rawScore - moderate) / (extreme - moderate)) * 0.25
    );
  // EXT band: [extreme, score_max] → [0.75, 1.0]
  const extSpan = Math.max(score_max - extreme, 1e-6);
  return Math.min(
    1,
    BUCKET_EDGES.high + ((rawScore - extreme) / extSpan) * 0.25,
  );
}

function isThresholdsValid(t: RegionalThresholds): boolean {
  // We require `extreme` to be strictly above `moderate` (since we
  // interpolate across that span) and `score_max >= extreme`. We DO NOT
  // require `t.high` to be valid since we don't use it as a bucket boundary.
  return (
    t.low > 0 &&
    t.moderate > t.low &&
    t.extreme > t.moderate &&
    t.score_max >= t.extreme
  );
}

/** Compute the threat factor for a single fire. Inputs are already
 *  per-fire — see `aggregateThreat` for the multi-fire case.
 *
 *  Pipeline:
 *    distance → exponential decay (closer = more)
 *    size     → linear ramp from 50ac to 5000ac (SIZE_CEILING_ACRES)
 *    OR-combine the two (either factor alone can pull the result to 1)
 *    wind alignment bump (additive ±0.15, only when wind is non-calm)
 *    stale-FIRMS dampener (multiplicative ×0.6)
 *
 *  Returns a value in [0, 1]. */
export function fireThreatFactor(args: {
  distanceMi: number;
  /** Null when only a satellite pixel was matched (FIRMS hits have no acres). */
  acres: number | null;
  /** True when this is a FIRMS-only detection and its `acq_date` is > 24h old. */
  isStaleFirms: boolean;
  /** Wind FROM direction in degrees (meteorological convention). Null = unknown. */
  windDeg: number | null;
  /** Bearing from user → fire in degrees (0 = N, 90 = E). */
  bearingToFireDeg: number;
  /** Wind speed in kph. Null or < WIND_CALM_KPH disables the wind bump. */
  windSpeedKph: number | null;
  /** Named-incident containment percentage. Null for FIRMS hits or when the
   *  agency hasn't reported it. When >= CONTAINED_PCT_THRESHOLD the threat
   *  is dampened (operationally "the fire is mostly defeated"). */
  containedPct?: number | null;
}): number {
  const {
    distanceMi,
    acres,
    isStaleFirms,
    windDeg,
    bearingToFireDeg,
    windSpeedKph,
    containedPct,
  } = args;
  const dist = Math.exp(-distanceMi / DISTANCE_DECAY_MI);
  const sizeRaw =
    acres == null
      ? 0
      : (acres - SIZE_FLOOR_ACRES) / (SIZE_CEILING_ACRES - SIZE_FLOOR_ACRES);
  const size = clamp01(sizeRaw);
  // OR-aggregation: P(A or B) = 1 - P(not A) × P(not B). Each factor can
  // independently pull the result toward 1. Distance and size now both
  // peak at meaningful thresholds (0 mi / 5000 ac) instead of saturating
  // on every 1000-ac named incident in the feed.
  const base = 1 - (1 - dist) * (1 - size);

  let windBump = 0;
  if (
    windDeg != null &&
    windSpeedKph != null &&
    windSpeedKph >= WIND_CALM_KPH
  ) {
    const delta = angularDiff(windDeg, bearingToFireDeg);
    if (delta < WIND_CONE_DEG) windBump = +WIND_BUMP;
    else if (delta > 180 - WIND_CONE_DEG) windBump = -WIND_BUMP;
  }

  // Both dampeners are multiplicative and stack. A stale FIRMS hit will
  // never carry containment data; a named incident will never be stale.
  // So in practice exactly one (or neither) applies — but allow both for
  // future-proofing if the data shapes ever overlap.
  const staleDampener = isStaleFirms ? STALE_DAMPENER : 1.0;
  const containmentDampener =
    containedPct != null && containedPct >= CONTAINED_PCT_THRESHOLD
      ? CONTAINED_DAMPENER
      : 1.0;
  return clamp01((base + windBump) * staleDampener * containmentDampener);
}

/** Aggregate threat across every nearby fire — take the max single-fire
 *  factor across NIFC/Cal Fire incidents AND FIRMS pixels within
 *  THREAT_RADIUS_MI. Returns 0 when no fires are in range. */
export function aggregateThreat(args: {
  userLoc: LatLon;
  namedIncidents: NamedIncident[];
  firmsHits: FireFeature[];
  windDeg: number | null;
  windSpeedKph: number | null;
  /** Override "now" for testability. Defaults to Date.now(). */
  nowMs?: number;
}): number {
  const {
    userLoc,
    namedIncidents,
    firmsHits,
    windDeg,
    windSpeedKph,
    nowMs = Date.now(),
  } = args;

  let worst = 0;

  for (const inc of namedIncidents) {
    if (inc.distance_mi > THREAT_RADIUS_MI) continue;
    const t = fireThreatFactor({
      distanceMi: inc.distance_mi,
      acres: inc.acres,
      isStaleFirms: false,
      windDeg,
      bearingToFireDeg: bearingTo(userLoc, { lat: inc.lat, lon: inc.lon }),
      windSpeedKph,
      containedPct: inc.contained_pct,
    });
    if (t > worst) worst = t;
  }

  for (const f of firmsHits) {
    const fireLoc = { lat: f.properties.lat, lon: f.properties.lon };
    const d = distanceMiles(userLoc, fireLoc);
    if (d > THREAT_RADIUS_MI) continue;
    const t = fireThreatFactor({
      distanceMi: d,
      acres: null,
      isStaleFirms: isFirmsStale(f.properties.acq_date, f.properties.acq_time, nowMs),
      windDeg,
      bearingToFireDeg: bearingTo(userLoc, fireLoc),
      windSpeedKph,
    });
    if (t > worst) worst = t;
  }

  return worst;
}

/** Composite score (0–1) — linear blend used ONLY for the Status orb arc
 *  visualization. The user-facing tier no longer comes from `bucketOf` of
 *  this number; it comes from the calibrated `compositeFromBuckets`
 *  matrix below. The two are coherent at most cells (the matrix was
 *  designed to agree with the linear blend at the corners) but can
 *  visually disagree by one band in a few middle cells — acceptable since
 *  the tier label, not the arc fill, is what the user reads. */
export function composite(weather: number, threat: number): number {
  return COMPOSITE_WEIGHTS.weather * weather + COMPOSITE_WEIGHTS.threat * threat;
}

// ─── Composite tier matrix ────────────────────────────────────────────────
//
// Replaces the prior `bucketOf(0.45*W + 0.55*T)` derivation. Two reasons:
//
// 1. The 0.45/0.55 weights were a political knob (don't cry wolf on
//    weather alone), not an empirical fit. A lookup matrix makes each
//    cell explainable on its own terms, with no hidden coefficients.
// 2. The linear blend's bucket sometimes lands in a tier the operational
//    intent wouldn't (e.g. W=high × T=mod maps to ~0.48 → MOD under the
//    linear blend, but the operational read is HIGH because both axes
//    are simultaneously elevated). The matrix captures that intent
//    directly.
//
// Design constraints encoded:
//
//   - W=ext × T=none lands at MOD, not HIGH. Preserves "weather alone
//     never escalates to HIGH" — the spirit of the prior 0.45 cap.
//   - W=none × T=ext lands at HIGH, not EXT. Close active fire on a
//     calm humid day is real but the wider environment isn't reinforcing
//     catastrophic spread; EXT is reserved for both axes screaming.
//   - The diagonal is identity (low/low=LOW, mod/mod=MOD, etc).
//   - Both-axes-elevated cells (HIGH×HIGH+) escalate to EXT once either
//     axis crosses into EXT itself.
//
// If a cell ever needs to change, this is the one place to do it.

type ThreatTier = RiskLevel | 'none';

const COMPOSITE_MATRIX: Record<RiskLevel, Record<ThreatTier, RiskLevel>> = {
  //              T=none      T=low       T=moderate  T=high      T=extreme
  low:      {     none: 'low',      low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'high'     },
  moderate: {     none: 'low',      low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'     },
  high:     {     none: 'moderate', low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme'  },
  extreme:  {     none: 'moderate', low: 'high',     moderate: 'high',     high: 'extreme',  extreme: 'extreme'  },
};

/** Headline tier from the two component tiers. `null` threatBucket means
 *  "no fire in range" — distinct from `low` (a fire is present but not
 *  threatening), so the matrix has a dedicated `none` column. When the
 *  weather bucket is null (still loading), returns null — the caller
 *  should show a skeleton until inputs resolve. */
export function compositeFromBuckets(
  weatherBucket: RiskLevel | null,
  threatBucket: RiskLevel | null,
): RiskLevel | null {
  if (weatherBucket == null) return null;
  const threatKey: ThreatTier = threatBucket ?? 'none';
  return COMPOSITE_MATRIX[weatherBucket][threatKey];
}

/** Per-fire personal threat bucket. Wraps `fireThreatFactor` + `bucketOf`
 *  so every user-facing surface (Status "Active Fire Threat", Safety
 *  banner, Fire Detail "Threat to You") reads the same fire the same way.
 *
 *  Synchronous; safe to call even when wind/age data isn't yet available
 *  (pass null for windDeg/windSpeedKph and the bump is skipped). When the
 *  caller doesn't yet have the user's distance to the fire, gate the call
 *  before invoking — this function assumes distanceMi is known. */
export function personalThreatBucket(args: {
  distanceMi: number;
  acres: number | null;
  containedPct: number | null;
  isStaleFirms: boolean;
  windDeg: number | null;
  windSpeedKph: number | null;
  bearingToFireDeg: number;
}): RiskLevel {
  return bucketOf(
    fireThreatFactor({
      distanceMi: args.distanceMi,
      acres: args.acres,
      isStaleFirms: args.isStaleFirms,
      windDeg: args.windDeg,
      bearingToFireDeg: args.bearingToFireDeg,
      windSpeedKph: args.windSpeedKph,
      containedPct: args.containedPct,
    }),
  );
}

// ─── Threat source identification ─────────────────────────────────────────

/** Which way the wind is moving the fire relative to the user. */
export type WindAlignment = 'toward' | 'away' | 'crosswind' | 'calm';

/** Identifies the single fire driving the user's threat score. Exposes
 *  enough metadata for the Status page "Threat Source" card to render
 *  either flavor (named incident or FIRMS pixel) and click through to
 *  /fire-detail with the right URL params. */
export type ThreatDriver =
  | {
      kind: 'incident';
      incident: NamedIncident;
      /** `t` value this fire produced — i.e. its contribution to aggregate threat. */
      threat: number;
      /** Bearing from user → fire (degrees, 0=N). */
      bearingDeg: number;
      wind: WindAlignment;
    }
  | {
      kind: 'firms';
      feature: FireFeature;
      threat: number;
      distanceMi: number;
      bearingDeg: number;
      wind: WindAlignment;
      isStale: boolean;
      /** Hours since acq_date+acq_time. Null when date couldn't be parsed. */
      ageHours: number | null;
    };

/** Find which fire is driving the user's threat score — i.e. the fire whose
 *  individual `t` is the max across all in-range candidates. Mirrors the
 *  loop inside `aggregateThreat` (kept separate so the formula function
 *  stays a pure number-returner).
 *
 *  Tiebreak: when the winning candidate is a FIRMS pixel, scan named
 *  incidents for one within FIRMS_TO_INCIDENT_TIEBREAK_MI of the pixel.
 *  If found, surface the named incident instead — its metadata is richer
 *  and it's the authoritative record for the same physical fire. */
export function findThreatDriver(args: {
  userLoc: LatLon;
  namedIncidents: NamedIncident[];
  firmsHits: FireFeature[];
  windDeg: number | null;
  windSpeedKph: number | null;
  nowMs?: number;
}): ThreatDriver | null {
  const {
    userLoc,
    namedIncidents,
    firmsHits,
    windDeg,
    windSpeedKph,
    nowMs = Date.now(),
  } = args;

  let bestIncident: { inc: NamedIncident; t: number; bearing: number } | null = null;
  let bestFirms:
    | { f: FireFeature; t: number; bearing: number; distanceMi: number; isStale: boolean }
    | null = null;

  for (const inc of namedIncidents) {
    if (inc.distance_mi > THREAT_RADIUS_MI) continue;
    const bearing = bearingTo(userLoc, { lat: inc.lat, lon: inc.lon });
    const t = fireThreatFactor({
      distanceMi: inc.distance_mi,
      acres: inc.acres,
      isStaleFirms: false,
      windDeg,
      bearingToFireDeg: bearing,
      windSpeedKph,
      containedPct: inc.contained_pct,
    });
    if (!bestIncident || t > bestIncident.t) {
      bestIncident = { inc, t, bearing };
    }
  }

  for (const f of firmsHits) {
    const fireLoc = { lat: f.properties.lat, lon: f.properties.lon };
    const d = distanceMiles(userLoc, fireLoc);
    if (d > THREAT_RADIUS_MI) continue;
    const bearing = bearingTo(userLoc, fireLoc);
    const isStale = isFirmsStale(f.properties.acq_date, f.properties.acq_time, nowMs);
    const t = fireThreatFactor({
      distanceMi: d,
      acres: null,
      isStaleFirms: isStale,
      windDeg,
      bearingToFireDeg: bearing,
      windSpeedKph,
    });
    if (!bestFirms || t > bestFirms.t) {
      bestFirms = { f, t, bearing, distanceMi: d, isStale };
    }
  }

  // No fires at all → no driver.
  if (!bestIncident && !bestFirms) return null;

  // Pick whichever is higher.
  const incidentWins =
    bestIncident != null && (!bestFirms || bestIncident.t >= bestFirms.t);

  if (incidentWins && bestIncident) {
    return {
      kind: 'incident',
      incident: bestIncident.inc,
      threat: bestIncident.t,
      bearingDeg: bestIncident.bearing,
      wind: computeWindAlignment(windDeg, bestIncident.bearing, windSpeedKph),
    };
  }

  // FIRMS won. Tiebreak: if any named incident is within
  // FIRMS_TO_INCIDENT_TIEBREAK_MI of the winning pixel, swap to that
  // incident — it's the authoritative record for the same physical fire.
  if (bestFirms) {
    const pixelLoc = {
      lat: bestFirms.f.properties.lat,
      lon: bestFirms.f.properties.lon,
    };
    let nearestIncident: { inc: NamedIncident; d: number } | null = null;
    for (const inc of namedIncidents) {
      const d = distanceMiles(pixelLoc, { lat: inc.lat, lon: inc.lon });
      if (d <= FIRMS_TO_INCIDENT_TIEBREAK_MI) {
        if (!nearestIncident || d < nearestIncident.d) {
          nearestIncident = { inc, d };
        }
      }
    }
    // Skip the swap when the candidate incident is already substantially
    // contained. A fresh FIRMS pixel next to a 75%+ contained incident is
    // either a residual hot spot or a flare-up outside the held perimeter
    // — swapping in the contained record would show "Containment: 90%"
    // next to the FIRMS pixel's high threat number, a visible contradiction.
    // Keep the FIRMS pixel as the surfaced driver in that case.
    const incidentIsContained =
      nearestIncident != null &&
      nearestIncident.inc.contained_pct != null &&
      nearestIncident.inc.contained_pct >= CONTAINED_PCT_THRESHOLD;
    if (nearestIncident && !incidentIsContained) {
      const bearing = bearingTo(userLoc, {
        lat: nearestIncident.inc.lat,
        lon: nearestIncident.inc.lon,
      });
      return {
        kind: 'incident',
        incident: nearestIncident.inc,
        // Use the FIRMS pixel's threat value — that's what drove the
        // aggregate threat number. Just swapping the displayed record.
        threat: bestFirms.t,
        bearingDeg: bearing,
        wind: computeWindAlignment(windDeg, bearing, windSpeedKph),
      };
    }

    const age = firmsAgeHours(
      bestFirms.f.properties.acq_date,
      bestFirms.f.properties.acq_time,
      nowMs,
    );
    return {
      kind: 'firms',
      feature: bestFirms.f,
      threat: bestFirms.t,
      distanceMi: bestFirms.distanceMi,
      bearingDeg: bestFirms.bearing,
      wind: computeWindAlignment(windDeg, bestFirms.bearing, windSpeedKph),
      isStale: bestFirms.isStale,
      ageHours: age,
    };
  }

  return null;
}

/** Classify wind direction vs the user→fire bearing. Returns 'calm' when
 *  the wind is below WIND_CALM_KPH (direction is noise at that point). */
export function computeWindAlignment(
  windDeg: number | null,
  bearingToFireDeg: number,
  windSpeedKph: number | null,
): WindAlignment {
  if (windDeg == null || windSpeedKph == null || windSpeedKph < WIND_CALM_KPH) {
    return 'calm';
  }
  const delta = angularDiff(windDeg, bearingToFireDeg);
  if (delta < WIND_CONE_DEG) return 'toward';
  if (delta > 180 - WIND_CONE_DEG) return 'away';
  return 'crosswind';
}

/** Format the age of a FIRMS detection for human display. Returns "just
 *  now", "X hr ago", or "X day(s) ago". Null when the date couldn't be
 *  parsed (defensive — real FIRMS rows always have valid dates). */
export function formatFirmsAge(
  acqDate: string | null,
  acqTime: string | null,
  nowMs: number = Date.now(),
): string | null {
  const ageHrs = firmsAgeHours(acqDate, acqTime, nowMs);
  if (ageHrs == null) return null;
  if (ageHrs < 1) return 'just now';
  if (ageHrs < 24) return `${Math.round(ageHrs)} hr ago`;
  const days = Math.floor(ageHrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Quartile lookup for a value in [0, 1]. */
export function bucketOf(score: number): RiskLevel {
  if (score < BUCKET_EDGES.low) return 'low';
  if (score < BUCKET_EDGES.moderate) return 'moderate';
  if (score < BUCKET_EDGES.high) return 'high';
  return 'extreme';
}

/** Subtitle copy that maps deliberately across every cell of
 *  `COMPOSITE_MATRIX`. Each cell's message names which inputs are driving
 *  the headline tier, even when the matrix downgrades the tier from what
 *  one axis alone would suggest (e.g. W=ext × T=none → MOD; the subtitle
 *  still acknowledges weather is elevated and explains why we don't escalate).
 *
 *  Verified cell-by-cell against the 4×5 matrix (see test table in the
 *  source comments below). No cell falls through to a generic fallback —
 *  every (weatherBucket, threatBucket) pair has its own dedicated message.
 *
 *  Cells (W row × T col, with matrix tier in [brackets]):
 *
 *    W=low   × T=none [LOW]  · low/low [LOW]  · low/mod [LOW]
 *    W=low   × T=high [MOD]  · low/ext [HIGH] → "active fire" copy
 *    W=mod   × T=none [LOW]  · mod/low [MOD]  · mod/mod [MOD]
 *    W=mod   × T=high [HIGH] · mod/ext [HIGH] → "active fire" copy
 *    W=high  × T=none [MOD]  · high/low [MOD] · high/mod [HIGH]    → "weather elevated" copy
 *    W=high  × T=high [HIGH] · high/ext [EXT]                       → "both elevated" copy
 *    W=ext   × T=none [MOD]  · ext/low [HIGH] · ext/mod [HIGH]      → "weather elevated" copy
 *    W=ext   × T=high [EXT]  · ext/ext [EXT]                        → "both elevated" copy */
export function compositeSubtitle(args: {
  weatherBucket: RiskLevel;
  /** Null when no fires are in range (distinct from LOW threat). */
  threatBucket: RiskLevel | null;
}): string {
  const { weatherBucket, threatBucket } = args;
  const wHot = weatherBucket === 'high' || weatherBucket === 'extreme';
  const tHigh = threatBucket === 'high' || threatBucket === 'extreme';

  // Both axes elevated → matrix lands at HIGH or EXT
  if (wHot && tHigh) {
    return 'Both fire weather and a nearby fire are elevated — review your plan.';
  }

  // Active fire is the dominant signal → matrix lands at MOD/HIGH from threat alone
  if (tHigh) {
    return 'An active fire is nearby — review your plan.';
  }

  // Weather is the dominant signal (W=high or W=ext, T not high)
  if (wHot) {
    if (threatBucket == null) {
      return 'Fire weather is elevated, but no active fires nearby.';
    }
    if (threatBucket === 'low') {
      return 'Fire weather is elevated and a fire is in the area.';
    }
    // threatBucket === 'moderate'
    return 'Fire weather is elevated and a nearby fire is adding risk.';
  }

  // Neither axis elevated → matrix lands at LOW or MOD
  if (threatBucket == null) {
    return 'No immediate fire risk in your area.';
  }
  if (threatBucket === 'low') {
    return 'A nearby fire is at low threat — monitor for changes.';
  }
  // threatBucket === 'moderate'
  return 'A nearby fire is adding risk — stay aware.';
}

// ─── Private helpers ──────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Smallest angular distance between two bearings, in [0, 180]. */
function angularDiff(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingTo(from: LatLon, to: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** FIRMS acq_date is "YYYY-MM-DD" and acq_time is "HHMM" (UTC). */
export function isFirmsStale(
  acqDate: string | null,
  acqTime: string | null,
  nowMs: number = Date.now(),
): boolean {
  const ageHrs = firmsAgeHours(acqDate, acqTime, nowMs);
  if (ageHrs == null) return false; // unknown age → don't dampen
  return ageHrs > STALE_FIRMS_HOURS;
}

/** Hours elapsed since a FIRMS acquisition. Returns null when the date
 *  can't be parsed (defensive — real FIRMS rows always have valid dates). */
export function firmsAgeHours(
  acqDate: string | null,
  acqTime: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (!acqDate) return null;
  const time = (acqTime ?? '0000').padStart(4, '0');
  const iso = `${acqDate}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (nowMs - ms) / (3600 * 1000);
}

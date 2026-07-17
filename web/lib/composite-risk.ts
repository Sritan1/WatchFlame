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

/** Per-fire threat is distance × size, combined MULTIPLICATIVELY (not the old
 *  probabilistic-OR `1 − (1−dist)(1−size)`). Size is a Hill-saturating
 *  multiplier in [SIZE_WEIGHT_FLOOR, 1]: a known-but-small fire still reads as
 *  a real fire at close range (the floor), while a larger fire approaches the
 *  full distance-driven threat. The key fix: a large fire FAR away no longer
 *  pegs threat to 1.0 — distance always attenuates. See docs/ARCHITECTURE.md (the overall-risk composite).
 *
 *  A FIRMS pixel (acres unknown) gets size multiplier 1.0, preserving the
 *  distance-only behavior the satellite path has always had. */
const SIZE_WEIGHT_FLOOR = 0.7;
/** Hill half-saturation point (acres): sizeMult = floor + (1−floor)·acres/(acres+K).
 *  K=300 → a 300-ac fire is halfway up the size ramp, a 1,000-ac fire ~93%,
 *  and the curve keeps differentiating past 5,000 ac (no hard ceiling) so
 *  megafires still separate from merely-large fires. */
const SIZE_HILL_K_ACRES = 300;

/** ±this many degrees from "wind blowing toward me" counts as alignment —
 *  used only by `computeWindAlignment` for the toward/away/crosswind LABEL.
 *  The threat modifier itself (see WIND_REL) varies smoothly as cos(angle),
 *  no cone step. */
const WIND_CONE_DEG = 30;
/** Below this wind speed (kph) we treat wind direction as noise. */
const WIND_CALM_KPH = 5;
/** Relative magnitude of the wind-alignment modifier. Wind scales the per-fire
 *  threat MULTIPLICATIVELY: ×(1+WIND_REL) blowing directly toward the user,
 *  ×(1−WIND_REL) directly away, ×1 at crosswind, eased by cos(angle) (no hard
 *  cone edges). Multiplicative (not a flat additive bump) so the effect stays
 *  proportional to the distance/size-driven base — a far fire whose base has
 *  decayed to ~0 can't be escalated a tier by wind direction alone. See
 *  the overall-risk composite in docs/ARCHITECTURE.md. */
const WIND_REL = 0.2;

/** FIRMS staleness dampener. Threat ramps smoothly from ×1.0 (fresh) toward
 *  ×STALE_DAMPENER as a detection ages, centered at STALE_FIRMS_HOURS with a
 *  STALE_RAMP_HOURS logistic transition width — no hard 24 h cliff. */
const STALE_FIRMS_HOURS = 24;
const STALE_DAMPENER = 0.6;
const STALE_RAMP_HOURS = 6;

/** Containment dampener. Threat ramps smoothly from ×1.0 (uncontained) toward
 *  ×CONTAINED_DAMPENER as a named incident's containment rises, centered at
 *  CONTAINED_PCT_THRESHOLD (the operational "containment is holding" mark)
 *  with a CONTAINED_RAMP_PCT width — no hard 75% cliff. */
const CONTAINED_PCT_THRESHOLD = 75;
const CONTAINED_DAMPENER = 0.6;
const CONTAINED_RAMP_PCT = 8;

/** Outer eligibility radius. Fires beyond this are skipped (keeps the
 *  aggregation loop tight); the distance factor tapers smoothly to 0 as it
 *  approaches this boundary so there's no cliff at exactly 50 mi. */
export const THREAT_RADIUS_MI = 50;
/** Distance at which the smooth edge taper begins. Inside it, the natural
 *  exp-decay stands; from here to THREAT_RADIUS_MI the contribution eases to
 *  0. See docs/ARCHITECTURE.md (the overall-risk composite). */
const TAPER_START_MI = 46;

/** When the highest-threat fire is a FIRMS pixel, look for a named incident
 *  within this radius. If one exists, surface IT as the threat source
 *  instead of the satellite pixel — the named incident has richer metadata
 *  (name, acres, containment) and is the authoritative record for the same
 *  physical fire. Sized generously since FIRMS pixels are ~375m resolution
 *  and a single fire can spawn pixels spread across that footprint. */
export const FIRMS_TO_INCIDENT_TIEBREAK_MI = 3;

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

// ─── Smooth threat-factor primitives ──────────────────────────────────────
//
// The per-fire threat used to have four hard cliffs — a fire crossing 50 mi,
// 75% containment, 24 h FIRMS staleness, or the ±30° wind cone flipped the
// score discontinuously. These helpers replace each step with a continuous
// transition so the threat moves smoothly as conditions change. See
// docs/ARCHITECTURE.md (the overall-risk composite).

/** Smoothstep (Hermite) 0→1 over a clamped [0, 1] input. */
function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Standard logistic 0→1, midpoint at x=0. */
function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Distance contribution: exponential decay, tapered smoothly to 0 as the
 *  distance approaches THREAT_RADIUS_MI so there's no cliff at the 50 mi
 *  eligibility boundary (it's already ~0 by then). */
function distanceFactor(distanceMi: number): number {
  const decay = Math.exp(-distanceMi / DISTANCE_DECAY_MI);
  if (distanceMi <= TAPER_START_MI) return decay;
  if (distanceMi >= THREAT_RADIUS_MI) return 0;
  const t = (distanceMi - TAPER_START_MI) / (THREAT_RADIUS_MI - TAPER_START_MI);
  return decay * (1 - smoothstep01(t));
}

/** Size multiplier in [SIZE_WEIGHT_FLOOR, 1] via Hill saturation. `acres == null`
 *  (FIRMS pixel, size unknown) → 1.0, preserving the distance-only behavior
 *  the satellite path has always had. */
function sizeMultiplier(acres: number | null): number {
  if (acres == null) return 1;
  const a = Math.max(0, acres);
  const hill = a / (a + SIZE_HILL_K_ACRES);
  return SIZE_WEIGHT_FLOOR + (1 - SIZE_WEIGHT_FLOOR) * hill;
}

/** Smooth staleness dampener from a FIRMS detection's age (hours). `null`
 *  (named incident, or an unparseable date) → 1.0 (no damp). Eases from 1.0
 *  toward STALE_DAMPENER, centered at STALE_FIRMS_HOURS. */
function stalenessDampener(ageHours: number | null): number {
  if (ageHours == null) return 1;
  return (
    1 - (1 - STALE_DAMPENER) * logistic((ageHours - STALE_FIRMS_HOURS) / STALE_RAMP_HOURS)
  );
}

/** Smooth containment dampener from a named incident's contained %. `null` →
 *  1.0. Eases from 1.0 toward CONTAINED_DAMPENER, centered at the threshold. */
function containmentDampener(containedPct: number | null | undefined): number {
  if (containedPct == null) return 1;
  return (
    1 -
    (1 - CONTAINED_DAMPENER) *
      logistic((containedPct - CONTAINED_PCT_THRESHOLD) / CONTAINED_RAMP_PCT)
  );
}

/** Compute the threat factor for a single fire. Inputs are already
 *  per-fire — see `aggregateThreat` for the multi-fire case.
 *
 *  Pipeline:
 *    base = distanceFactor(d) × sizeMultiplier(acres)   — multiplicative:
 *           threatening only if BOTH close AND large; a far megafire no
 *           longer pegs to 1.0. FIRMS pixels (no acres) stay distance-only.
 *    × wind alignment modifier (1 + WIND_REL·cos(angle), smooth, calm-gated)
 *    × smooth staleness dampener (from FIRMS age)
 *    × smooth containment dampener (from contained %)
 *
 *  Returns a value in [0, 1]. */
export function fireThreatFactor(args: {
  distanceMi: number;
  /** Null when only a satellite pixel was matched (FIRMS hits have no acres). */
  acres: number | null;
  /** Age in hours of a FIRMS detection; `null` for named incidents or when the
   *  acquisition date can't be parsed. Drives the smooth staleness dampener. */
  firmsAgeHours: number | null;
  /** Wind FROM direction in degrees (meteorological convention). Null = unknown. */
  windDeg: number | null;
  /** Bearing from user → fire in degrees (0 = N, 90 = E). */
  bearingToFireDeg: number;
  /** Wind speed in kph. Null or < WIND_CALM_KPH disables the wind modifier (×1). */
  windSpeedKph: number | null;
  /** Named-incident containment percentage. Null for FIRMS hits or when the
   *  agency hasn't reported it. Higher containment smoothly dampens threat. */
  containedPct?: number | null;
}): number {
  const {
    distanceMi,
    acres,
    firmsAgeHours,
    windDeg,
    bearingToFireDeg,
    windSpeedKph,
    containedPct,
  } = args;

  // Multiplicative base — distance always attenuates (a far large fire can't
  // peg the score on size alone), and the edge taper removes the 50 mi cliff.
  const base = distanceFactor(distanceMi) * sizeMultiplier(acres);

  // Wind alignment: a smooth, MULTIPLICATIVE modifier centered on 1.0 —
  // ×(1+WIND_REL) blowing directly toward the user, ×(1−WIND_REL) directly
  // away, ×1 at crosswind (cos eases between them) or when calm. Scaling the
  // existing threat — rather than adding a flat ±bump — keeps wind's influence
  // proportional to distance: a far fire whose `base` has already decayed to
  // ~0 can't be pushed up a tier by wind direction alone (the old additive
  // `base + bump` did exactly that near the 50 mi eligibility edge). Replaces
  // the old ±30° cone step.
  let windModifier = 1;
  if (windDeg != null && windSpeedKph != null && windSpeedKph >= WIND_CALM_KPH) {
    const delta = angularDiff(windDeg, bearingToFireDeg);
    windModifier = 1 + WIND_REL * Math.cos((delta * Math.PI) / 180);
  }

  // All three modifiers are multiplicative and stack on `base`. In practice a
  // fire is either a FIRMS pixel (has age, no containment) or a named incident
  // (has containment, no age), so at most one dampener is < 1 at a time.
  return clamp01(
    base *
      windModifier *
      stalenessDampener(firmsAgeHours) *
      containmentDampener(containedPct),
  );
}

/** Aggregate threat across every nearby fire — the max single-fire factor
 *  across NIFC/Cal Fire incidents AND FIRMS pixels within THREAT_RADIUS_MI.
 *  Returns 0 when no fires are in range.
 *
 *  This is exactly the driving fire's factor, so it delegates to
 *  `findThreatDriver` rather than re-walking every fire in a parallel loop —
 *  one source of truth means the orb's threat value and the Threat Source
 *  card can never disagree. (Callers that need BOTH should call
 *  findThreatDriver once and read `.threat`, not call both functions.) */
export function aggregateThreat(args: {
  userLoc: LatLon;
  namedIncidents: NamedIncident[];
  firmsHits: FireFeature[];
  windDeg: number | null;
  windSpeedKph: number | null;
  /** Override "now" for testability. Defaults to Date.now(). */
  nowMs?: number;
}): number {
  return findThreatDriver(args)?.threat ?? 0;
}

/** Composite score (0–1) — linear blend of the environment + threat axes.
 *  Used ONLY as the continuous *intensity* that positions the orb dot WITHIN
 *  its tier band (see `tierArcFraction`). It no longer drives the dial position
 *  directly, so the arc can never land in a different band than the matrix
 *  tier. The user-facing tier comes from `compositeFromBuckets` below. */
export function composite(weather: number, threat: number): number {
  return COMPOSITE_WEIGHTS.weather * weather + COMPOSITE_WEIGHTS.threat * threat;
}

/** Tier → arc band on the orb's 0–1 dial. The bands tile the dial in quartiles
 *  (LOW, MOD, HIGH, EXT) with a small inset at the very bottom/top so the
 *  endpoint dot is always visible and the dial never reads as a fully empty or
 *  fully closed circle. */
const ARC_BANDS: Record<RiskLevel, readonly [number, number]> = {
  low: [0.05, 0.25],
  moderate: [0.25, 0.5],
  high: [0.5, 0.75],
  extreme: [0.75, 0.97],
};

/** Arc fill (0–1) for the Status orb, ANCHORED to the headline tier so the dial
 *  can never sit in a different band than the orb color. `tier` (the matrix
 *  output, which is the source of truth and what colors the orb) picks the
 *  band; `intensity` (the continuous composite blend, 0–1) only positions the
 *  dot WITHIN that band.
 *
 *  Replaces feeding the raw `composite()` blend straight to the dial, which
 *  could land a band away from the matrix tier in the cells where the matrix
 *  overrides the quartile (e.g. weather=HIGH × threat=MOD → HIGH tier, but the
 *  blend ≈ 0.48 → a MOD-looking dial). */
export function tierArcFraction(tier: RiskLevel, intensity: number): number {
  const [lo, hi] = ARC_BANDS[tier];
  const t = Math.max(0, Math.min(1, intensity));
  return lo + t * (hi - lo);
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

// ─── Environmental ensemble: fire weather ⊗ ignition likelihood ────────────
//
// Stage 1 of the headline. Fire-weather SEVERITY (W: "how bad would a fire be")
// and the ML IGNITION LIKELIHOOD (I: "how likely a fire starts") are two views
// of the same environmental question, so we fold them into one tier `E` before
// the W×T matrix — rather than adding a correlated third axis that would
// double-count the weather they share.
//
// The combination is hazard = likelihood × consequence: a SYMMETRIC,
// MULTIPLICATIVE matrix. Either factor being low pulls the product down (the
// off-diagonal corners cap to MOD), and only when both are elevated does E
// escalate. A useful side effect: low severity tempers an over-confident
// ignition reading (and vice-versa), so a single signal can never run away.
//
// `ENV_MATRIX[W][I]` is symmetric across the diagonal (swap W and I → same
// cell), so neither signal dominates.

const ENV_MATRIX: Record<RiskLevel, Record<RiskLevel, RiskLevel>> = {
  //              I=low       I=moderate  I=high      I=extreme
  low:      {     low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'moderate' },
  moderate: {     low: 'low',      moderate: 'moderate', high: 'moderate', extreme: 'high'     },
  high:     {     low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'     },
  extreme:  {     low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme'  },
};

/** Stage-1 environmental tier from fire-weather severity + ignition likelihood.
 *  When `ignitionBucket` is null (ML signal still loading or unavailable), the
 *  environmental tier is just the weather bucket — so the composite degrades
 *  cleanly to its prior W×T behavior and the headline never waits on the model.
 *  Returns null only when the weather bucket itself isn't ready. */
export function envFromBuckets(
  weatherBucket: RiskLevel | null,
  ignitionBucket: RiskLevel | null,
): RiskLevel | null {
  if (weatherBucket == null) return null;
  if (ignitionBucket == null) return weatherBucket;
  return ENV_MATRIX[weatherBucket][ignitionBucket];
}

/** Per-fire personal threat bucket. Wraps `fireThreatFactor` + `bucketOf`
 *  so every user-facing surface (Status "Active Fire Threat", Safety
 *  banner, Fire Detail "Threat to You") reads the same fire the same way.
 *
 *  Synchronous; safe to call even when wind/age data isn't yet available
 *  (pass null for windDeg/windSpeedKph and the wind modifier stays ×1). When the
 *  caller doesn't yet have the user's distance to the fire, gate the call
 *  before invoking — this function assumes distanceMi is known. */
export function personalThreatBucket(args: {
  distanceMi: number;
  acres: number | null;
  containedPct: number | null;
  /** Age in hours of a FIRMS detection; `null` for named incidents or unknown
   *  age. Replaces the prior boolean so staleness dampens smoothly. */
  firmsAgeHours: number | null;
  windDeg: number | null;
  windSpeedKph: number | null;
  bearingToFireDeg: number;
}): RiskLevel {
  return bucketOf(
    fireThreatFactor({
      distanceMi: args.distanceMi,
      acres: args.acres,
      firmsAgeHours: args.firmsAgeHours,
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
 *  individual `t` is the max across all in-range candidates. `aggregateThreat`
 *  is derived from this (its `.threat`), so this single loop is the one source
 *  of truth for both the orb's threat value and the Threat Source card.
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
      firmsAgeHours: null,
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
    const ageHr = firmsAgeHours(f.properties.acq_date, f.properties.acq_time, nowMs);
    const isStale = ageHr != null && ageHr > STALE_FIRMS_HOURS;
    const t = fireThreatFactor({
      distanceMi: d,
      acres: null,
      firmsAgeHours: ageHr,
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

/** Subtitle copy for the Status headline.
 *
 *  Keyed on the ENVIRONMENTAL tier (`envBucket` = fire weather ⊗ ignition
 *  likelihood) and `threatBucket` — the exact two inputs `compositeFromBuckets`
 *  uses for the headline tier — so the subtitle can never contradict the orb.
 *  (The previous version keyed on raw `weatherBucket` and so understated any
 *  headline that ignition escalated.)
 *
 *  When the environment is elevated (E = high or extreme) the copy names the
 *  driver: fire conditions, ignition likelihood, or both. E can only be high/
 *  extreme when at least one of weather/ignition is itself high+ (and E=extreme
 *  only when both are), so a driver phrase is always available. The call to
 *  action tracks the resulting headline tier: none for LOW, "Stay aware." for
 *  MODERATE, "Review your plan." for HIGH/EXTREME. The E-elevated + no-fire
 *  cells stay MODERATE by design and say so ("but no active fires are nearby"),
 *  which is where we explain why an extreme environment alone does not escalate. */
export function compositeSubtitle(args: {
  /** Environmental tier (weather ⊗ ignition) — drives the headline, so drives
   *  the subtitle too. */
  envBucket: RiskLevel;
  /** Null when no fires are in range (distinct from LOW threat). */
  threatBucket: RiskLevel | null;
  /** Raw component buckets — used only to name the driver when E is elevated. */
  weatherBucket: RiskLevel;
  ignitionBucket: RiskLevel | null;
}): string {
  const { envBucket, threatBucket, weatherBucket, ignitionBucket } = args;
  const threatKey: ThreatTier = threatBucket ?? 'none';

  // Environment calm (E = low): lead with the fire/threat story.
  if (envBucket === 'low') {
    switch (threatKey) {
      case 'none': return 'No active fires nearby and conditions are calm.';
      case 'low': return 'A fire is in the area but it poses little threat right now.';
      case 'moderate': return 'A nearby fire is adding a little risk. Conditions are otherwise calm.';
      case 'high': return 'An active fire is nearby. Stay aware.';
      case 'extreme': return 'An active fire nearby is a serious threat. Review your plan.';
    }
  }

  // Environment mildly elevated (E = moderate).
  if (envBucket === 'moderate') {
    switch (threatKey) {
      case 'none': return 'No active fires nearby right now.';
      case 'low': return 'A fire is in the area and adding some risk. Stay aware.';
      case 'moderate': return 'A nearby fire is adding risk. Stay aware.';
      case 'high': return 'An active fire is nearby. Review your plan.';
      case 'extreme': return 'An active fire nearby is a serious threat. Review your plan.';
    }
  }

  // Environment elevated (E = high or extreme): name the driver, then the
  // threat tail + call to action.
  const wHot = weatherBucket === 'high' || weatherBucket === 'extreme';
  const iHot = ignitionBucket === 'high' || ignitionBucket === 'extreme';
  const severe = envBucket === 'extreme'; // only reachable when both are extreme

  let driver: string;
  if (severe || (wHot && iHot)) {
    driver = severe
      ? 'Fire conditions and ignition risk are extreme'
      : 'Fire conditions and ignition risk are elevated';
  } else if (iHot && !wHot) {
    driver = 'Conditions look primed for ignition';
  } else {
    driver = 'Fire conditions are elevated'; // weather-driven (or safe fallback)
  }

  switch (threatKey) {
    case 'none':
      return `${driver}, but no active fires are nearby. Stay aware.`;
    case 'low':
      // E=high/low lands at MODERATE; E=extreme/low lands at HIGH.
      return severe
        ? `${driver}, and a fire is in the area. Review your plan.`
        : `${driver}, and a fire is in the area. Stay aware.`;
    case 'moderate':
      return `${driver}, and a nearby fire is adding risk. Review your plan.`;
    case 'high':
      return `${driver}, and an active fire is nearby. Review your plan.`;
    case 'extreme':
      return `${driver}, and a nearby fire is a serious threat. Review your plan.`;
  }
  return `${driver}.`; // unreachable: threatKey is always one of the cases above
}

// ─── Private helpers ──────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Smallest angular distance between two bearings, in [0, 180]. */
function angularDiff(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingTo(from: LatLon, to: LatLon): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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

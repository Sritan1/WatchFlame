// The "Personal Threat" score, from state-calibrated fire weather and the worst
// active fire in range. Both axes run 0 to 1, a quarter per tier. The headline tier
// comes from the matrices below, not a blend. composite() only places the orb dot.

import type {
  FireFeature,
  LatLon,
  NamedIncident,
  RegionalThresholds,
} from '@/lib/api';
import type { RiskLevel } from '@/lib/theme';

/** Composite weights. They add to 1. */
export const COMPOSITE_WEIGHTS = { weather: 0.45, threat: 0.55 } as const;

/** Distance decay. 6 mi lands at the EXT edge, 12 mi in HIGH, 25 mi in MOD. */
const DISTANCE_DECAY_MI = 21;

/** Floor on the size multiplier. A small confirmed fire close by is still a real
 *  fire. FIRMS pixels have no acreage and get 1.0. */
const SIZE_WEIGHT_FLOOR = 0.7;
/** Half-saturation in acres. 300 acres is halfway up the ramp, 1,000 about 93%.
 *  No ceiling, so megafires stay ahead of merely large ones. */
const SIZE_HILL_K_ACRES = 300;

/** How far off "blowing toward me" still counts as toward. Label only. The threat
 *  modifier follows cos(angle) and has no cone edge. */
const WIND_CONE_DEG = 30;
/** Below this wind speed (kph) direction is just noise. */
const WIND_CALM_KPH = 5;
/** Wind modifier size. Up 20% blowing at you, down 20% away. It multiplies instead
 *  of adding, or a distant fire whose threat already decayed to nothing could jump
 *  a tier on direction alone. */
const WIND_REL = 0.2;

/** Old FIRMS detections count for less. The falloff eases either side of 24 hours
 *  instead of dropping off a cliff at exactly 24. */
const STALE_FIRMS_HOURS = 24;
const STALE_DAMPENER = 0.6;
const STALE_RAMP_HOURS = 6;

/** Contained incidents count for less. 75% is where crews treat containment as
 *  holding. */
const CONTAINED_PCT_THRESHOLD = 75;
const CONTAINED_DAMPENER = 0.6;
const CONTAINED_RAMP_PCT = 8;

/** Fires past this are skipped. The distance factor is already 0 by here, so
 *  nothing jumps at the boundary. */
export const THREAT_RADIUS_MI = 50;
/** Where that taper starts. Closer in, the plain exponential decay stands. */
const TAPER_START_MI = 46;

/** When a FIRMS pixel wins, a named incident this close is almost certainly the
 *  same fire, so show the incident instead. Kept generous. Pixels are 375m and one
 *  fire throws several. */
export const FIRMS_TO_INCIDENT_TIEBREAK_MI = 3;

/** Bucket edges for both inputs and the composite output. */
const BUCKET_EDGES = { low: 0.25, moderate: 0.5, high: 0.75 } as const;

/** Mirror of _GLOBAL_FALLBACK in api/core/regional_calibration.py, for responses
 *  with no per-state thresholds. Keep the four cutoffs in lockstep or Status reads
 *  a raw score as a percentile. score_max is ours alone, normalizeWeather needs it. */
const GLOBAL_FALLBACK_THRESHOLDS: RegionalThresholds = {
  low: 0.3,
  moderate: 0.6,
  high: 0.8, // unused for bucketing, kept for shape parity with backend
  extreme: 0.8,
  score_max: 1.0,
};

/** Stretch the raw score onto 0-1 against the region's percentile thresholds, a
 *  quarter per tier, mirroring _bucket in regional_calibration.py. Skip it and a
 *  humid state's worst day divides down to a fraction of score_max and reads LOW. */
export function normalizeWeather(
  rawScore: number,
  t: RegionalThresholds | null | undefined,
): number {
  const thresholds = t && isThresholdsValid(t) ? t : GLOBAL_FALLBACK_THRESHOLDS;
  const { low, moderate, extreme, score_max } = thresholds;

  // NaN fails every comparison below and would fall out the far end as 'extreme',
  // pinning the orb to CRITICAL on bad data.
  if (!Number.isFinite(rawScore)) return 0;
  if (rawScore <= 0) return 0;
  if (rawScore < low) return (rawScore / low) * BUCKET_EDGES.low;
  if (rawScore < moderate)
    return BUCKET_EDGES.low + ((rawScore - low) / (moderate - low)) * 0.25;
  if (rawScore < extreme)
    return (
      BUCKET_EDGES.moderate +
      ((rawScore - moderate) / (extreme - moderate)) * 0.25
    );
  const extSpan = Math.max(score_max - extreme, 1e-6);
  return Math.min(
    1,
    BUCKET_EDGES.high + ((rawScore - extreme) / extSpan) * 0.25,
  );
}

function isThresholdsValid(t: RegionalThresholds): boolean {
  // t.high is exempt because we never bucket on it.
  return (
    t.low > 0 &&
    t.moderate > t.low &&
    t.extreme > t.moderate &&
    t.score_max >= t.extreme
  );
}

// Per-fire threat used to jump at four hard edges, 50 miles, 75% containment, 24
// hour detection age and the 30 degree wind cone. These smooth all four out.

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Exponential decay with distance, eased to 0 near the eligibility radius. */
function distanceFactor(distanceMi: number): number {
  const decay = Math.exp(-distanceMi / DISTANCE_DECAY_MI);
  if (distanceMi <= TAPER_START_MI) return decay;
  if (distanceMi >= THREAT_RADIUS_MI) return 0;
  const t = (distanceMi - TAPER_START_MI) / (THREAT_RADIUS_MI - TAPER_START_MI);
  return decay * (1 - smoothstep01(t));
}

/** Unknown acreage means a FIRMS pixel, which stays distance-only at 1.0. */
function sizeMultiplier(acres: number | null): number {
  if (acres == null) return 1;
  const a = Math.max(0, acres);
  const hill = a / (a + SIZE_HILL_K_ACRES);
  return SIZE_WEIGHT_FLOOR + (1 - SIZE_WEIGHT_FLOOR) * hill;
}

/** Damp an aging FIRMS detection. Null age leaves it alone. */
function stalenessDampener(ageHours: number | null): number {
  if (ageHours == null) return 1;
  return (
    1 - (1 - STALE_DAMPENER) * logistic((ageHours - STALE_FIRMS_HOURS) / STALE_RAMP_HOURS)
  );
}

/** Damp an incident as crews get containment on it. Null leaves it alone. */
function containmentDampener(containedPct: number | null | undefined): number {
  if (containedPct == null) return 1;
  return (
    1 -
    (1 - CONTAINED_DAMPENER) *
      logistic((containedPct - CONTAINED_PCT_THRESHOLD) / CONTAINED_RAMP_PCT)
  );
}

/** Threat from one fire, 0 to 1. Distance times size sets the base, then wind
 *  alignment, detection age and containment scale it. */
export function fireThreatFactor(args: {
  distanceMi: number;
  /** Null for a satellite pixel, which has no acres. */
  acres: number | null;
  /** Null for a named incident or an unreadable acquisition date. */
  firmsAgeHours: number | null;
  /** Direction the wind is blowing FROM, in degrees. Null when unknown. */
  windDeg: number | null;
  /** Bearing from the user to the fire, 0 for north and 90 for east. */
  bearingToFireDeg: number;
  /** Null or calm turns the wind modifier off. */
  windSpeedKph: number | null;
  /** Null for FIRMS hits or when the agency hasn't said. */
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

  // Multiplying means distance always bites. A big fire far off can't score on
  // size alone.
  const base = distanceFactor(distanceMi) * sizeMultiplier(acres);

  // Wind multiplies on cos(angle). See WIND_REL for why it isn't additive.
  let windModifier = 1;
  if (windDeg != null && windSpeedKph != null && windSpeedKph >= WIND_CALM_KPH) {
    const delta = angularDiff(windDeg, bearingToFireDeg);
    windModifier = 1 + WIND_REL * Math.cos((delta * Math.PI) / 180);
  }

  // A fire is either a FIRMS pixel with an age and no containment, or a named
  // incident the other way round, so only one dampener ever really applies.
  return clamp01(
    base *
      windModifier *
      stalenessDampener(firmsAgeHours) *
      containmentDampener(containedPct),
  );
}

/** Threat from the worst fire in range, or 0 when there are none. Delegates to
 *  findThreatDriver so the orb can never disagree with the Threat Source card. If
 *  you need both, call findThreatDriver once and read .threat. */
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

/** Blend of the two axes, 0 to 1. Only the intensity that places the orb dot
 *  inside its band. The tier people see comes from compositeFromBuckets. */
export function composite(weather: number, threat: number): number {
  return COMPOSITE_WEIGHTS.weather * weather + COMPOSITE_WEIGHTS.threat * threat;
}

/** Where each tier sits on the orb's dial. Inset at both ends so the ring never
 *  looks empty or closed. */
const ARC_BANDS: Record<RiskLevel, readonly [number, number]> = {
  low: [0.05, 0.25],
  moderate: [0.25, 0.5],
  high: [0.5, 0.75],
  extreme: [0.75, 0.97],
};

/** How far to fill the Status orb's arc. The tier picks the band and intensity
 *  only positions the dot inside it, so the dial can never sit in a different band
 *  than the orb's color. */
export function tierArcFraction(tier: RiskLevel, intensity: number): number {
  const [lo, hi] = ARC_BANDS[tier];
  const t = Math.max(0, Math.min(1, intensity));
  return lo + t * (hi - lo);
}

// Replaced a weighted blend, whose weights were a judgement call dressed up as
// math. Bad weather with nothing burning tops out at MODERATE, a bad fire on a calm
// day reaches HIGH, and EXTREME needs both. Change a cell here and nowhere else.

type ThreatTier = RiskLevel | 'none';

const COMPOSITE_MATRIX: Record<RiskLevel, Record<ThreatTier, RiskLevel>> = {
  //              T=none      T=low       T=moderate  T=high      T=extreme
  low:      {     none: 'low',      low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'high'     },
  moderate: {     none: 'low',      low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'     },
  high:     {     none: 'moderate', low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme'  },
  extreme:  {     none: 'moderate', low: 'high',     moderate: 'high',     high: 'extreme',  extreme: 'extreme'  },
};

/** Headline tier from the two component tiers. A null threatBucket means no fire
 *  in range, which is not the same as a fire that isn't threatening, hence the
 *  separate none column. Null weather means still loading. */
export function compositeFromBuckets(
  weatherBucket: RiskLevel | null,
  threatBucket: RiskLevel | null,
): RiskLevel | null {
  if (weatherBucket == null) return null;
  const threatKey: ThreatTier = threatBucket ?? 'none';
  return COMPOSITE_MATRIX[weatherBucket][threatKey];
}

// Stage 1. "How bad would a fire be" and "how likely is one to start" read the
// same environment, so folding them avoids counting the weather twice. Symmetric,
// and either one being low drags the result down.

const ENV_MATRIX: Record<RiskLevel, Record<RiskLevel, RiskLevel>> = {
  //              I=low       I=moderate  I=high      I=extreme
  low:      {     low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'moderate' },
  moderate: {     low: 'low',      moderate: 'moderate', high: 'moderate', extreme: 'high'     },
  high:     {     low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'     },
  extreme:  {     low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme'  },
};

/** Environmental tier from weather and ignition likelihood. With no ignition
 *  reading this is just the weather bucket, so the headline never waits on the
 *  model. Null only when weather isn't ready. */
export function envFromBuckets(
  weatherBucket: RiskLevel | null,
  ignitionBucket: RiskLevel | null,
): RiskLevel | null {
  if (weatherBucket == null) return null;
  if (ignitionBucket == null) return weatherBucket;
  return ENV_MATRIX[weatherBucket][ignitionBucket];
}

/** Threat tier for one fire. Status, the Safety banner and Fire Detail all go
 *  through here so they can't read the same fire differently. Missing wind is
 *  fine, but the distance has to be known, so gate the call until it is. */
export function personalThreatBucket(args: {
  distanceMi: number;
  acres: number | null;
  containedPct: number | null;
  /** Null for incidents or unknown age. */
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

/** Which way the wind is moving the fire relative to the user. */
export type WindAlignment = 'toward' | 'away' | 'crosswind' | 'calm';

/** The one fire driving the user's threat score, with enough detail for the Threat
 *  Source card to render either flavor and link into /fire-detail. */
export type ThreatDriver =
  | {
      kind: 'incident';
      incident: NamedIncident;
      threat: number;
      /** Bearing from the user to the fire in degrees, 0 for north. */
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
      /** Null when the detection date wouldn't parse. */
      ageHours: number | null;
    };

/** Pick the fire with the highest individual threat, the single source of truth
 *  for both the orb and the Threat Source card. When a satellite pixel wins, a
 *  named incident close enough to be the same fire is surfaced instead. */
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

  if (!bestIncident && !bestFirms) return null;

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

  // The pixel won, so look for a named incident close enough to be the same fire.
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
    // Not if it is mostly contained. A fresh pixel beside a 75%-contained fire is a
    // flare-up outside the line, and "Containment: 90%" over a high threat number
    // contradicts itself. Keep the pixel.
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
        // Keep the pixel's threat value. Only the displayed record changes.
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

/** Wind direction relative to the fire. Reads 'calm' below the calm cutoff. */
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

/** Detection age as "just now", "3 hr ago" or "2 days ago". */
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

/** Subtitle under the Status headline. Keyed on the same two tiers the headline
 *  uses, so the words can never contradict the orb. An earlier version keyed on
 *  raw weather and understated every headline that ignition had escalated. */
export function compositeSubtitle(args: {
  /** Environmental tier. Drives the headline, so it drives the subtitle. */
  envBucket: RiskLevel;
  /** Null when no fires are in range, which is not the same as low threat. */
  threatBucket: RiskLevel | null;
  /** Only used to name the driver when the environment is elevated. */
  weatherBucket: RiskLevel;
  ignitionBucket: RiskLevel | null;
}): string {
  const { envBucket, threatBucket, weatherBucket, ignitionBucket } = args;
  const threatKey: ThreatTier = threatBucket ?? 'none';

  // Calm environment, so lead with the fire.
  if (envBucket === 'low') {
    switch (threatKey) {
      case 'none': return 'No active fires nearby and conditions are calm.';
      case 'low': return 'A fire is in the area but it poses little threat right now.';
      case 'moderate': return 'A nearby fire is adding a little risk. Conditions are otherwise calm.';
      case 'high': return 'An active fire is nearby. Stay aware.';
      case 'extreme': return 'An active fire nearby is a serious threat. Review your plan.';
    }
  }

  if (envBucket === 'moderate') {
    switch (threatKey) {
      case 'none': return 'No active fires nearby right now.';
      case 'low': return 'A fire is in the area and adding some risk. Stay aware.';
      case 'moderate': return 'A nearby fire is adding risk. Stay aware.';
      case 'high': return 'An active fire is nearby. Review your plan.';
      case 'extreme': return 'An active fire nearby is a serious threat. Review your plan.';
    }
  }

  // Elevated environment, so name the driver first, then the fire.
  const wHot = weatherBucket === 'high' || weatherBucket === 'extreme';
  const iHot = ignitionBucket === 'high' || ignitionBucket === 'extreme';
  // Only reachable from the extreme/extreme cell, or from extreme weather with no
  // ignition reading, which is why the driver below checks before naming it.
  const severe = envBucket === 'extreme';

  let driver: string;
  if (severe && ignitionBucket != null) {
    driver = 'Fire conditions and ignition risk are extreme';
  } else if (severe) {
    driver = 'Fire conditions are extreme';
  } else if (wHot && iHot) {
    driver = 'Fire conditions and ignition risk are elevated';
  } else if (iHot && !wHot) {
    driver = 'Conditions look primed for ignition';
  } else {
    driver = 'Fire conditions are elevated'; // weather driven, and a safe default
  }

  switch (threatKey) {
    case 'none':
      return `${driver}, but no active fires are nearby. Stay aware.`;
    case 'low':
      // Lands at moderate normally, high when the environment is extreme.
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
  return `${driver}.`; // unreachable, threatKey is always one of the above
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Smallest angle between two bearings, 0 to 180. */
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

/** Hours since a FIRMS detection, or null when the date wouldn't parse. */
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

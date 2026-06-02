// Wire types — ported verbatim from app/lib/types.ts so the web client speaks
// the exact same shapes as the mobile app. Backend changes touch both.

export type DangerLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';
export type LatLon = { lat: number; lon: number };

export interface FireFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    lat: number;
    lon: number;
    brightness: number | null;
    confidence: string | null;
    acq_date: string | null;
    acq_time: string | null;
    satellite: string | null;
    frp: number | null;
    daynight: string | null;
  };
}

export interface FireCollection {
  type: 'FeatureCollection';
  features: FireFeature[];
}

export interface RiskRequest {
  temperature: number;
  humidity: number;
  wind_speed: number;
  days_since_rain: number;
  season: Season;
  lat?: number;
  lon?: number;
  kbdi?: number;
  ndvi_anomaly?: number;
  state?: string;
}

export interface RegionalThresholds {
  low: number;
  moderate: number;
  high: number;
  extreme: number;
  score_max: number;
}

export interface RiskResponse {
  risk_score: number;
  danger_level: DangerLevel;
  factors: {
    vpd: number;
    wind: number;
    drought: number;
    season: number;
  };
  regional_level?: DangerLevel | null;
  regional_state?: string | null;
  regional_thresholds?: RegionalThresholds | null;
  kbdi?: number | null;
  /** Observed days-since-rain from the Open-Meteo Archive precip pull,
   *  computed alongside KBDI. Null on manual / no-coords requests or when
   *  the archive fetch failed. */
  days_since_rain_observed?: number | null;
  ndvi_anomaly?: number | null;
}

/** Per-state calibration thresholds + score-distribution summary. Shape
 *  matches `api/data/regional_thresholds.json` per-state entries. */
export interface StateCalibration {
  n_fires: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  thresholds: {
    low: number;
    moderate: number;
    high: number;
    extreme: number;
  };
  score_summary: {
    min: number;
    median: number;
    mean: number;
    max: number;
  };
}

/** Backend diagnostic response from `/risk/calibration`. Returns the full
 *  per-state thresholds dict so the calibration ladder UI can render
 *  without a separate copy of the JSON. */
export interface CalibrationInfo {
  version: string | null;
  fitted_at: string | null;
  algorithm_version: string | null;
  states_calibrated: string[];
  global_thresholds: {
    low: number;
    moderate: number;
    high: number;
    extreme: number;
  };
  states: Record<string, StateCalibration>;
}

// ─── Trajectory (Tier 2 #7) ────────────────────────────────────────────────
// Short-term forward-looking signal — projects the V4 score 6 hours forward
// using Open-Meteo hourly forecast data and surfaces a tier:
//   - 'rising'  → conditions deteriorating; V4 score up > 10%
//   - 'steady'  → conditions stable; V4 score within ±10%
//   - 'falling' → conditions improving; V4 score down > 10%
// Backend logic in api/core/trajectory.py + api/routes/trajectory.py.

export type TrajectoryTier = 'rising' | 'steady' | 'falling';

export interface TrajectoryFrame {
  label: string;            // "now", "+1 hr", … "+6 hr"
  iso_time: string;         // local-time ISO string from the forecast API
  temperature_c: number;
  humidity_pct: number;
  wind_kph: number;
  precipitation_mm: number;
  v4_score: number;         // compute_risk output for this frame
}

export interface TrajectoryResponse {
  tier: TrajectoryTier;
  delta_pct: number;        // signed % change in v4_score (positive = rising)
  horizon_hours: number;
  now: TrajectoryFrame;
  projected: TrajectoryFrame;
  dominant_driver: 'vpd' | 'wind' | 'humidity';
  // Hour-by-hour series, now .. +horizon_hours (frames[0] === now,
  // frames[frames.length - 1] === projected). Powers the phase-space curve.
  frames: TrajectoryFrame[];
}

export interface WeatherResponse {
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number | null;
  conditions: string | null;
  location: { lat: number; lon: number; name: string | null };
}

export interface GeocodeHit {
  name: string;
  state: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

export type ShelterStatus = 'OPEN' | 'STANDBY' | 'FULL';

export interface Shelter {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  distance_mi: number;
  address: string | null;
  // Tier-1 "activated / open right now" fields. Present (non-null) only when
  // `activated` is true — an authoritative open shelter from Emergency
  // Management / the Red Cross. Candidate facilities carry `activated: false`.
  activated?: boolean;
  status?: ShelterStatus;
  capacity?: number | null;
  occupancy?: number | null;
  pet_friendly?: boolean | null;
  ada_accessible?: boolean | null;
  managing_org?: string | null;
  updated_at?: string | null;
}

export interface ActiveDisaster {
  disaster_number: number;
  declaration_type: string;
  declaration_date: string;
  incident_type: string;
  incident_begin: string | null;
  incident_end: string | null;
  title: string;
  designated_area: string;
  state: string;
  url: string | null;
}

export interface DisastersNearResponse {
  county: { state: string; name: string; fips: string } | null;
  active: ActiveDisaster[];
}

export interface NamedIncident {
  source: 'nifc' | 'calfire';
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance_mi: number;
  acres: number | null;
  contained_pct: number | null;
  personnel: number | null;
  cause: string | null;
  started: string | null;
  agency: string | null;
  state: string | null;
  county: string | null;
  location: string | null;
  control_statement: string | null;
  url: string | null;
}

/** Map the backend's uppercase DangerLevel to the web theme's lowercase RiskLevel. */
export function dangerToRisk(d: DangerLevel): 'low' | 'moderate' | 'high' | 'extreme' {
  return d.toLowerCase() as 'low' | 'moderate' | 'high' | 'extreme';
}

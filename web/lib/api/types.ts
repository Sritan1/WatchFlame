// The shapes the backend sends and expects. Change a route and change these.

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
  /** Real days since rain, worked out alongside KBDI from the archive. Null when
   *  the request had no coordinates or the archive fetch failed. */
  days_since_rain_observed?: number | null;
  ndvi_anomaly?: number | null;
}

/** One state's thresholds and score summary, shaped like the entries in
 *  api/data/regional_thresholds.json. */
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

/** What /risk/calibration returns, every state's thresholds, so the ladder can
 *  draw itself without its own copy of the JSON. */
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

// Trajectory. Where the fire-weather score is heading over the next 6 hours. A
// move of more than 10% either way counts as rising or falling. Math is in
// api/core/trajectory.py.

export type IgnitionLevel = 'low' | 'moderate' | 'high' | 'extreme';

/** The model's read on how fire-start-like conditions are. `percentile` is a
 *  calibrated 0-100 index, not a probability. `as_of` is the date the conditions
 *  come from, since the archive lags about 6 days. */
export interface IgnitionResponse {
  percentile: number;
  probability: number;
  level: IgnitionLevel;
  as_of: string;
}

export type TrajectoryTier = 'rising' | 'steady' | 'falling';

export interface TrajectoryFrame {
  label: string;            // "now", then "+1 hr" through "+6 hr"
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
  // Every hour out to the horizon, first frame being now and last the
  // projection. This is what the phase-space curve draws.
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
  // These are only filled in for shelters that are actually open, as reported by
  // emergency management or the Red Cross. Everything else is a candidate
  // building where a shelter could open, and carries activated: false.
  activated?: boolean;
  status?: ShelterStatus;
  capacity?: number | null;
  occupancy?: number | null;
  pet_friendly?: boolean | null;
  ada_accessible?: boolean | null;
  managing_org?: string | null;
  // FEMA's timestamps, not ours. updated_at is the last status report, which is
  // often missing, and opened_at is when the shelter opened.
  updated_at?: string | null;
  opened_at?: string | null;
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

/** The backend shouts its danger levels, the theme wants them lowercase. */
export function dangerToRisk(d: DangerLevel): 'low' | 'moderate' | 'high' | 'extreme' {
  return d.toLowerCase() as 'low' | 'moderate' | 'high' | 'extreme';
}

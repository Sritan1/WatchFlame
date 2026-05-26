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

export interface Shelter {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  distance_mi: number;
  address: string | null;
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

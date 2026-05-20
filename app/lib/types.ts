export type DangerLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export type FireFeature = {
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
};

export type FireCollection = {
  type: 'FeatureCollection';
  features: FireFeature[];
};

export type RiskRequest = {
  temperature: number;
  humidity: number;
  wind_speed: number;
  days_since_rain: number;
  season: Season;
  // When supplied, the backend swaps the days_since_rain proxy for a real
  // KBDI lookup and adds per-state regional calibration to the response.
  lat?: number;
  lon?: number;
  // Manual KBDI override (0-800). Takes precedence over the lat/lon fetch.
  kbdi?: number;
  // Manual NDVI anomaly override (typically -0.30..+0.30). When supplied
  // the backend uses it as the vegetation signal in place of the calendar
  // season multiplier. Surfaced in the Risk Calculator's Season ↔
  // Vegetation toggle.
  ndvi_anomaly?: number;
  // Explicit regional-calibration state (2-letter US code, e.g. "CA").
  // Skips Census geocoding when supplied. Surfaced in the Risk Calculator's
  // state dropdown so users can see how the same inputs bucket in
  // different states.
  state?: string;
};

export type RiskResponse = {
  risk_score: number;
  danger_level: DangerLevel;
  /**
   * V2 factors (multiplicative VPD-based fire weather index):
   *   vpd     — Vapor Pressure Deficit factor [0,1] (replaces V1's separate temp + humidity)
   *   wind    — power-law wind factor [0.2, 1] (0.2 floor)
   *   drought — exponential drying factor [0.1, 1] (0.1 floor)
   *   season  — vegetation/fuel multiplier [0.4, 1.0]
   */
  factors: {
    vpd: number;
    wind: number;
    drought: number;
    season: number;
  };
  // Present only when the request included lat/lon AND the resolved state
  // has fitted thresholds in api/data/regional_thresholds.json.
  regional_level?: DangerLevel | null;
  regional_state?: string | null;
  // Per-state percentile cutoffs for the resolved state (50th / 75th / 90th /
  // 97th of historical fire-day scores) + the max score observed in the
  // sample. Used by HeroOrb to fill the arc by regional percentile so the
  // dial and regional_level pill agree visually. Null outside fitted states.
  regional_thresholds?: {
    low: number;
    moderate: number;
    high: number;
    extreme: number;
    score_max: number;
  } | null;
  // Keetch-Byram Drought Index (0-800) used in place of days_since_rain.
  // Present only when lat/lon was sent and the upstream archive responded.
  kbdi?: number | null;
  // NDVI anomaly (current − same-month climatology), the vegetation-stress
  // signal that replaces the calendar season multiplier when satellite
  // data is available. Negative = drier/sparser than normal (higher risk),
  // positive = greener than normal. Present only when lat/lon was sent
  // and CDSE returned usable observations for both current + climatology.
  ndvi_anomaly?: number | null;
};

export type WeatherResponse = {
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number | null; // direction wind is coming FROM, 0-360°
  conditions: string | null;
  location: { lat: number; lon: number; name: string | null };
};

export type LatLon = { lat: number; lon: number };

export type GeocodeHit = {
  name: string;
  state: string | null;
  country: string | null;
  lat: number;
  lon: number;
};

export type SavedLocation = {
  id: string;
  label: string;
  lat: number;
  lon: number;
};

export type Shelter = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
  distance_mi: number;
  address: string | null;
};

export type ActiveDisaster = {
  disaster_number: number;
  declaration_type: string; // 'DR' | 'EM' | 'FM'
  declaration_date: string;
  incident_type: string;
  incident_begin: string | null;
  incident_end: string | null;
  title: string;
  designated_area: string;
  state: string;
  url: string | null;
};

export type DisastersNearResponse = {
  county: { state: string; name: string; fips: string } | null;
  active: ActiveDisaster[];
};

export type NamedIncident = {
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
};

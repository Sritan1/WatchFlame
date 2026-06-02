// Mock implementations of every backend endpoint.
// Scenario matches the reference screens: Berkeley, CA · Tilden Ridge Fire
// (extreme, 4.2mi NE) · 4 incidents in region · FEMA Cow Creek (FM-5632)
// · moderate risk overall. All RNG is seeded by lat/lon so the mock is stable.

import type {
  CalibrationInfo,
  DisastersNearResponse,
  FireCollection,
  GeocodeHit,
  NamedIncident,
  RiskRequest,
  RiskResponse,
  Shelter,
  TrajectoryResponse,
  WeatherResponse,
} from './types';

/** Pretend we made a network request — useful so callers see loading states. */
function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const BERKELEY = { lat: 37.8716, lon: -122.2727 } as const;

/** Four mocked incidents, sorted by distance. Tilden Ridge is the
 *  extreme-severity "active incident" the Command Center foregrounds. */
export const MOCK_INCIDENTS: NamedIncident[] = [
  {
    source: 'calfire', id: 'CA-2026-08412', name: 'Tilden Ridge Fire',
    lat: 37.9170, lon: -122.2528, distance_mi: 4.2,
    acres: 1840, contained_pct: 22, personnel: 312,
    cause: 'Under investigation', started: '2026-05-17T08:14:00Z',
    agency: 'CAL FIRE', state: 'CA', county: 'Contra Costa',
    location: 'Tilden Regional Park, Contra Costa County',
    control_statement: 'Crews focused on northern flank; mandatory evac for Zone 3-B.',
    url: 'https://www.fire.ca.gov/incidents/2026/5/17/tilden-ridge-fire/',
  },
  {
    source: 'calfire', id: 'CA-2026-08401', name: 'Briones Vista',
    lat: 37.9412, lon: -122.1411, distance_mi: 11.2,
    acres: 420, contained_pct: 45, personnel: 138,
    cause: 'Lightning', started: '2026-05-16T19:02:00Z',
    agency: 'CAL FIRE', state: 'CA', county: 'Contra Costa',
    location: 'Briones Regional Park · Lamorinda',
    control_statement: 'Active firing operations on the southern ridge.', url: null,
  },
  {
    source: 'calfire', id: 'CA-2026-08387', name: 'Mt. Diablo South',
    lat: 37.8819, lon: -121.9143, distance_mi: 18.6,
    acres: 95, contained_pct: 70, personnel: 64,
    cause: 'Equipment use', started: '2026-05-16T13:30:00Z',
    agency: 'CAL FIRE', state: 'CA', county: 'Contra Costa',
    location: 'Walnut Creek', control_statement: null, url: null,
  },
  {
    source: 'nifc', id: 'CA-2026-08378', name: 'Carquinez Strait',
    lat: 38.0586, lon: -122.2261, distance_mi: 24.1,
    acres: 60, contained_pct: 80, personnel: 28,
    cause: 'Human', started: '2026-05-15T22:11:00Z',
    agency: 'NIFC', state: 'CA', county: 'Contra Costa',
    location: 'Crockett', control_statement: null, url: null,
  },
];

/** Satellite point detections clustered around the Tilden Ridge perimeter. */
const MOCK_FIRES: FireCollection = {
  type: 'FeatureCollection',
  features: [
    { lat: 37.9170, lon: -122.2528, frp: 24.5, brightness: 358 },
    { lat: 37.9192, lon: -122.2514, frp: 18.2, brightness: 341 },
    { lat: 37.9147, lon: -122.2552, frp: 12.8, brightness: 322 },
    { lat: 37.9412, lon: -122.1411, frp: 9.4,  brightness: 309 },
    { lat: 37.8819, lon: -121.9143, frp: 4.1,  brightness: 298 },
    { lat: 38.0586, lon: -122.2261, frp: 2.6,  brightness: 291 },
  ].map((p) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
    properties: {
      lat: p.lat, lon: p.lon,
      brightness: p.brightness, confidence: 'nominal',
      acq_date: '2026-05-20', acq_time: '13:14',
      satellite: 'Suomi NPP', frp: p.frp, daynight: 'D',
    },
  })),
};

// temp=27 + humidity=42 + wind=14 + season=spring + drought=7d yields a
// mid-range fire-weather score → MODERATE-ish, matching the reference
// "Smoke Advisory" hero. Tweak inputs for a different default screenshot state.
const MOCK_WEATHER: WeatherResponse = {
  temperature: 27,
  humidity: 42,
  wind_speed: 14,
  wind_deg: 225,
  conditions: 'Smoke / hazy',
  location: { lat: BERKELEY.lat, lon: BERKELEY.lon, name: 'Berkeley, California' },
};

const MOCK_DISASTERS: DisastersNearResponse = {
  county: { state: 'CA', name: 'Contra Costa', fips: '06013' },
  active: [
    {
      disaster_number: 5632, declaration_type: 'FM',
      declaration_date: '2026-05-18', incident_type: 'Fire',
      incident_begin: '2026-05-15', incident_end: null,
      title: 'Cow Creek Fire', designated_area: 'Contra Costa County',
      state: 'CA',
      url: 'https://www.fema.gov/disaster/5632',
    },
  ],
};

// US city dataset for the mock geocoder — covers every major metro + state
// capitals + fire-prone Western towns. Real backend hits OpenWeatherMap's
// geocoder which returns broader/multi-country results.
const US_CITIES: GeocodeHit[] = [
  { name: 'New York',        state: 'NY', country: 'US', lat: 40.7128, lon: -74.0060 },
  { name: 'Los Angeles',     state: 'CA', country: 'US', lat: 34.0522, lon: -118.2437 },
  { name: 'Chicago',         state: 'IL', country: 'US', lat: 41.8781, lon: -87.6298 },
  { name: 'Houston',         state: 'TX', country: 'US', lat: 29.7604, lon: -95.3698 },
  { name: 'Phoenix',         state: 'AZ', country: 'US', lat: 33.4484, lon: -112.0740 },
  { name: 'Philadelphia',    state: 'PA', country: 'US', lat: 39.9526, lon: -75.1652 },
  { name: 'San Antonio',     state: 'TX', country: 'US', lat: 29.4241, lon: -98.4936 },
  { name: 'San Diego',       state: 'CA', country: 'US', lat: 32.7157, lon: -117.1611 },
  { name: 'Dallas',          state: 'TX', country: 'US', lat: 32.7767, lon: -96.7970 },
  { name: 'San Jose',        state: 'CA', country: 'US', lat: 37.3382, lon: -121.8863 },
  { name: 'Austin',          state: 'TX', country: 'US', lat: 30.2672, lon: -97.7431 },
  { name: 'Jacksonville',    state: 'FL', country: 'US', lat: 30.3322, lon: -81.6557 },
  { name: 'Fort Worth',      state: 'TX', country: 'US', lat: 32.7555, lon: -97.3308 },
  { name: 'Columbus',        state: 'OH', country: 'US', lat: 39.9612, lon: -82.9988 },
  { name: 'Charlotte',       state: 'NC', country: 'US', lat: 35.2271, lon: -80.8431 },
  { name: 'San Francisco',   state: 'CA', country: 'US', lat: 37.7749, lon: -122.4194 },
  { name: 'Indianapolis',    state: 'IN', country: 'US', lat: 39.7684, lon: -86.1581 },
  { name: 'Seattle',         state: 'WA', country: 'US', lat: 47.6062, lon: -122.3321 },
  { name: 'Denver',          state: 'CO', country: 'US', lat: 39.7392, lon: -104.9903 },
  { name: 'Washington',      state: 'DC', country: 'US', lat: 38.9072, lon: -77.0369 },
  { name: 'Boston',          state: 'MA', country: 'US', lat: 42.3601, lon: -71.0589 },
  { name: 'El Paso',         state: 'TX', country: 'US', lat: 31.7619, lon: -106.4850 },
  { name: 'Nashville',       state: 'TN', country: 'US', lat: 36.1627, lon: -86.7816 },
  { name: 'Detroit',         state: 'MI', country: 'US', lat: 42.3314, lon: -83.0458 },
  { name: 'Oklahoma City',   state: 'OK', country: 'US', lat: 35.4676, lon: -97.5164 },
  { name: 'Portland',        state: 'OR', country: 'US', lat: 45.5152, lon: -122.6784 },
  { name: 'Las Vegas',       state: 'NV', country: 'US', lat: 36.1699, lon: -115.1398 },
  { name: 'Memphis',         state: 'TN', country: 'US', lat: 35.1495, lon: -90.0490 },
  { name: 'Louisville',      state: 'KY', country: 'US', lat: 38.2527, lon: -85.7585 },
  { name: 'Baltimore',       state: 'MD', country: 'US', lat: 39.2904, lon: -76.6122 },
  { name: 'Milwaukee',       state: 'WI', country: 'US', lat: 43.0389, lon: -87.9065 },
  { name: 'Albuquerque',     state: 'NM', country: 'US', lat: 35.0844, lon: -106.6504 },
  { name: 'Tucson',          state: 'AZ', country: 'US', lat: 32.2226, lon: -110.9747 },
  { name: 'Fresno',          state: 'CA', country: 'US', lat: 36.7378, lon: -119.7871 },
  { name: 'Sacramento',      state: 'CA', country: 'US', lat: 38.5816, lon: -121.4944 },
  { name: 'Atlanta',         state: 'GA', country: 'US', lat: 33.7490, lon: -84.3880 },
  { name: 'Miami',           state: 'FL', country: 'US', lat: 25.7617, lon: -80.1918 },
  { name: 'Raleigh',         state: 'NC', country: 'US', lat: 35.7796, lon: -78.6382 },
  { name: 'Minneapolis',     state: 'MN', country: 'US', lat: 44.9778, lon: -93.2650 },
  { name: 'Tampa',           state: 'FL', country: 'US', lat: 27.9506, lon: -82.4572 },
  { name: 'Orlando',         state: 'FL', country: 'US', lat: 28.5384, lon: -81.3789 },
  { name: 'New Orleans',     state: 'LA', country: 'US', lat: 29.9511, lon: -90.0715 },
  { name: 'Cleveland',       state: 'OH', country: 'US', lat: 41.4993, lon: -81.6944 },
  { name: 'Honolulu',        state: 'HI', country: 'US', lat: 21.3099, lon: -157.8581 },
  { name: 'Anchorage',       state: 'AK', country: 'US', lat: 61.2181, lon: -149.9003 },
  { name: 'Salt Lake City',  state: 'UT', country: 'US', lat: 40.7608, lon: -111.8910 },
  { name: 'Boise',           state: 'ID', country: 'US', lat: 43.6150, lon: -116.2023 },
  { name: 'Billings',        state: 'MT', country: 'US', lat: 45.7833, lon: -108.5007 },
  { name: 'Cheyenne',        state: 'WY', country: 'US', lat: 41.1400, lon: -104.8197 },
  { name: 'Reno',            state: 'NV', country: 'US', lat: 39.5296, lon: -119.8138 },
  { name: 'Spokane',         state: 'WA', country: 'US', lat: 47.6588, lon: -117.4260 },
  { name: 'Eugene',          state: 'OR', country: 'US', lat: 44.0521, lon: -123.0868 },
  { name: 'Bend',            state: 'OR', country: 'US', lat: 44.0582, lon: -121.3153 },
  { name: 'Flagstaff',       state: 'AZ', country: 'US', lat: 35.1983, lon: -111.6513 },
  { name: 'Santa Fe',        state: 'NM', country: 'US', lat: 35.6870, lon: -105.9378 },
  { name: 'Colorado Springs', state: 'CO', country: 'US', lat: 38.8339, lon: -104.8214 },
  { name: 'Boulder',         state: 'CO', country: 'US', lat: 40.0150, lon: -105.2705 },
  { name: 'Aspen',           state: 'CO', country: 'US', lat: 39.1911, lon: -106.8175 },
  { name: 'Berkeley',        state: 'CA', country: 'US', lat: BERKELEY.lat, lon: BERKELEY.lon },
  { name: 'Oakland',         state: 'CA', country: 'US', lat: 37.8044, lon: -122.2712 },
  { name: 'Santa Barbara',   state: 'CA', country: 'US', lat: 34.4208, lon: -119.6982 },
  { name: 'Santa Cruz',      state: 'CA', country: 'US', lat: 36.9741, lon: -122.0308 },
  { name: 'Napa',            state: 'CA', country: 'US', lat: 38.2975, lon: -122.2869 },
  { name: 'Paradise',        state: 'CA', country: 'US', lat: 39.7596, lon: -121.6219 },
  { name: 'Redding',         state: 'CA', country: 'US', lat: 40.5865, lon: -122.3917 },
  { name: 'Chico',           state: 'CA', country: 'US', lat: 39.7285, lon: -121.8375 },
  { name: 'Lake Tahoe',      state: 'CA', country: 'US', lat: 39.0968, lon: -120.0324 },
  { name: 'Yosemite',        state: 'CA', country: 'US', lat: 37.8651, lon: -119.5383 },
  { name: 'Big Sur',         state: 'CA', country: 'US', lat: 36.2704, lon: -121.8081 },
  { name: 'Asheville',       state: 'NC', country: 'US', lat: 35.5951, lon: -82.5515 },
  { name: 'Savannah',        state: 'GA', country: 'US', lat: 32.0809, lon: -81.0912 },
  { name: 'Charleston',      state: 'SC', country: 'US', lat: 32.7765, lon: -79.9311 },
  { name: 'Key West',        state: 'FL', country: 'US', lat: 24.5551, lon: -81.7800 },
];

const MOCK_SHELTERS: Shelter[] = [
  // Tier 1 — activated/open shelters (mock). Sorted first, like the real route.
  {
    id: 'open-nss-1001', name: 'MLK Jr. Civic Center Shelter', lat: 37.8702, lon: -122.2729,
    type: 'American Red Cross', distance_mi: 0.5, address: '2151 Martin Luther King Jr Way, Berkeley, CA',
    activated: true, status: 'OPEN', capacity: 300, occupancy: 142,
    pet_friendly: true, ada_accessible: true, managing_org: 'American Red Cross',
    updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    id: 'open-nss-1002', name: 'Berkeley High School Shelter', lat: 37.8676, lon: -122.2720,
    type: 'County Emergency Management', distance_mi: 0.7, address: '1980 Allston Way, Berkeley, CA',
    activated: true, status: 'OPEN', capacity: 180, occupancy: 171,
    pet_friendly: false, ada_accessible: true, managing_org: 'Alameda County EM',
    updated_at: new Date(Date.now() - 47 * 60_000).toISOString(),
  },
  // Candidates (static potential evacuation points).
  { id: '1', name: 'Berkeley Community Center', lat: 37.8689, lon: -122.2737, type: 'community_centre', distance_mi: 0.3, address: '1900 Sixth St, Berkeley, CA', activated: false },
  { id: '2', name: 'Albany Senior Center', lat: 37.8870, lon: -122.2974, type: 'community_centre', distance_mi: 1.8, address: '846 Masonic Ave, Albany, CA', activated: false },
  { id: '3', name: 'Emeryville Recreation Center', lat: 37.8316, lon: -122.2855, type: 'community_centre', distance_mi: 2.9, address: '4300 San Pablo Ave, Emeryville, CA', activated: false },
];

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** Tetens / Magnus saturation vapor pressure (hPa). Matches api/core/risk_algorithm.py. */
function saturationVaporPressureHpa(tC: number): number {
  return 6.1078 * Math.exp((17.27 * tC) / (tC + 237.3));
}

/** Coarse state inference from a CONUS lat/lon — used to populate
 *  regional calibration on the Status flow, which sends coords without an
 *  explicit state. Only covers the 17 fitted states; everything else returns
 *  null so the response falls back to global cutoffs (matches mobile behavior). */
function inferStateFromCoords(lat: number, lon: number): string | null {
  // CA is the demo home; widen its box a bit so saved locations like Boulder
  // (CO) and Reno (NV) still resolve to their own states.
  if (lat >= 32 && lat <= 42 && lon >= -125 && lon <= -114) return 'CA';
  if (lat >= 25 && lat <= 31 && lon >= -88 && lon <= -80)  return 'FL';
  if (lat >= 31 && lat <= 37 && lon >= -114.8 && lon <= -109) return 'AZ';
  if (lat >= 37 && lat <= 41 && lon >= -109.1 && lon <= -102) return 'CO';
  if (lat >= 32 && lat <= 37 && lon >= -109.1 && lon <= -103) return 'NM';
  if (lat >= 35 && lat <= 42 && lon >= -120 && lon <= -114) return 'NV';
  if (lat >= 41.9 && lat <= 49 && lon >= -117 && lon <= -111) return 'MT';
  if (lat >= 42 && lat <= 49 && lon >= -117 && lon <= -111) return 'ID';
  if (lat >= 41 && lat <= 45 && lon >= -111 && lon <= -104) return 'WY';
  if (lat >= 37 && lat <= 42 && lon >= -114.1 && lon <= -109) return 'UT';
  if (lat >= 33.5 && lat <= 37.1 && lon >= -103 && lon <= -94.4) return 'OK';
  if (lat >= 25.8 && lat <= 36.5 && lon >= -106.7 && lon <= -93.5) return 'TX';
  if (lat >= 30.5 && lat <= 35.1 && lon >= -85.6 && lon <= -80.8) return 'GA';
  if (lat >= 33.8 && lat <= 36.6 && lon >= -84.3 && lon <= -75.4) return 'NC';
  if (lat >= 32 && lat <= 35.3 && lon >= -83.4 && lon <= -78.5) return 'SC';
  if (lat >= 42 && lat <= 46.3 && lon >= -124.6 && lon <= -116.5) return 'OR';
  if (lat >= 45.5 && lat <= 49.1 && lon >= -124.7 && lon <= -116.9) return 'WA';
  return null;
}

/** Plausible KBDI value seeded by coords — drier inland/south, wetter coastal
 *  PNW. Real backend fetches this from Open-Meteo's 60-day archive. */
function syntheticKbdi(lat: number, _lon: number): number {
  // Latitude proxy: 25°N (south) ≈ 600, 49°N (north) ≈ 150. Add a Berkeley-ish
  // sweet spot so the demo lands at "Very dry" (matches the reference's
  // "moderate fire weather, drying out" framing).
  const lerp = Math.max(0, Math.min(1, (49 - lat) / 24));
  return Math.round(150 + lerp * 450);
}

/** Plausible NDVI anomaly seeded by coords — slightly drier than normal
 *  for CA spring (Berkeley demo). Mobile fetches this from CDSE Sentinel-2. */
function syntheticNdviAnomaly(lat: number, lon: number): number {
  const state = inferStateFromCoords(lat, lon);
  if (state === 'CA') return -0.05; // matches Berkeley demo scenario
  if (state === 'FL' || state === 'GA') return 0.02;
  if (state === 'AZ' || state === 'NV') return -0.09;
  return -0.02;
}

// V4 calibration constants — mirror api/core/risk_algorithm.py RiskParams
// (DEFAULT_PARAMS), fit against a 500-fire FPA-FOD hindcast
// (scripts/fit_v4_params.py). Keep in sync with the backend if re-fit.
const VPD_SCALE_HPA = 40.32;
const WIND_SCALE_KPH = 52.31;
const DROUGHT_TAU_DAYS = 15.0;
const WIND_FLOOR = 0.0458;
const DROUGHT_FLOOR = 0.2786;
const EXP_VPD = 0.4534;
const EXP_WIND = 0.4262;
const EXP_DROUGHT = 0.1204;

const SEASON_MULT: Record<RiskRequest['season'], number> = {
  winter: 0.4,
  spring: 0.8,
  summer: 1.0,
  fall: 0.9,
};

/** Plausible per-state regional thresholds — mirrors the shape of
 *  api/data/regional_thresholds.json (real backend returns exact percentile
 *  cutoffs from FPA-FOD fitting). These are demo-ballpark only. */
const REGIONAL_THRESHOLDS: Record<string, NonNullable<RiskResponse['regional_thresholds']>> = {
  CA: { low: 0.25, moderate: 0.29, high: 0.33, extreme: 0.39, score_max: 0.45 },
  FL: { low: 0.20, moderate: 0.25, high: 0.30, extreme: 0.32, score_max: 0.37 },
  AZ: { low: 0.31, moderate: 0.37, high: 0.41, extreme: 0.45, score_max: 0.49 },
  CO: { low: 0.29, moderate: 0.34, high: 0.42, extreme: 0.49, score_max: 0.52 },
  NM: { low: 0.28, moderate: 0.39, high: 0.50, extreme: 0.57, score_max: 0.65 },
  NV: { low: 0.31, moderate: 0.37, high: 0.42, extreme: 0.45, score_max: 0.50 },
  MT: { low: 0.22, moderate: 0.30, high: 0.37, extreme: 0.49, score_max: 0.52 },
  ID: { low: 0.24, moderate: 0.33, high: 0.39, extreme: 0.46, score_max: 0.49 },
  WY: { low: 0.27, moderate: 0.37, high: 0.48, extreme: 0.52, score_max: 0.63 },
  UT: { low: 0.32, moderate: 0.38, high: 0.44, extreme: 0.49, score_max: 0.58 },
  OK: { low: 0.23, moderate: 0.29, high: 0.37, extreme: 0.40, score_max: 0.48 },
  TX: { low: 0.23, moderate: 0.29, high: 0.37, extreme: 0.44, score_max: 0.54 },
  GA: { low: 0.18, moderate: 0.22, high: 0.28, extreme: 0.31, score_max: 0.41 },
  NC: { low: 0.19, moderate: 0.23, high: 0.29, extreme: 0.31, score_max: 0.32 },
  SC: { low: 0.20, moderate: 0.24, high: 0.28, extreme: 0.34, score_max: 0.37 },
  OR: { low: 0.24, moderate: 0.28, high: 0.34, extreme: 0.38, score_max: 0.41 },
  WA: { low: 0.21, moderate: 0.29, high: 0.35, extreme: 0.41, score_max: 0.59 },
};

function regionalBucket(
  score: number,
  th: NonNullable<RiskResponse['regional_thresholds']>,
): RiskResponse['danger_level'] {
  // Per api/core/regional_calibration.py: HIGH→EXT boundary is th.extreme
  // (97th percentile). th.high (90th percentile) is informational only.
  if (score < th.low) return 'LOW';
  if (score < th.moderate) return 'MODERATE';
  if (score < th.extreme) return 'HIGH';
  return 'EXTREME';
}

/** V4 fire-weather index — mirrors api/core/risk_algorithm.py exactly.
 *  Inputs are accepted as the mobile UI sends them: temperature °C,
 *  humidity %, wind in MPH (converted to kph internally), kbdi 0–800,
 *  days_since_rain int, season. */
function computeMockRisk(req: RiskRequest): RiskResponse {
  // Synthesize realistic kbdi/ndvi/state when coords supplied — mirrors the
  // real backend's asyncio.gather over KBDI / NDVI / Census-state lookups.
  const hasCoords = req.lat != null && req.lon != null;
  const effectiveKbdi = req.kbdi ?? (hasCoords ? syntheticKbdi(req.lat!, req.lon!) : null);
  const effectiveNdvi = req.ndvi_anomaly ?? (hasCoords ? syntheticNdviAnomaly(req.lat!, req.lon!) : null);
  const inferredState = req.state ?? (hasCoords ? inferStateFromCoords(req.lat!, req.lon!) : null);

  // VPD factor — Tetens / 40 hPa scale, clamp [0, 1]
  const vpdHpa = saturationVaporPressureHpa(req.temperature) * (1 - clamp(req.humidity, 0, 100) / 100);
  const vpdFactor = clamp01(vpdHpa / VPD_SCALE_HPA);

  // Wind factor — power law (kph/40)^1.5 with 0.2 floor. UI sends mph.
  const windKph = Math.max(0, req.wind_speed) * 1.60934;
  const windBase = Math.pow(windKph / WIND_SCALE_KPH, 1.5);
  const windFactor = clamp(WIND_FLOOR + (1 - WIND_FLOOR) * windBase, WIND_FLOOR, 1);

  // Drought factor — KBDI if supplied, else exp drying. 0.1 floor.
  let droughtFactor: number;
  if (effectiveKbdi != null) {
    droughtFactor = clamp(DROUGHT_FLOOR + (1 - DROUGHT_FLOOR) * (effectiveKbdi / 800), DROUGHT_FLOOR, 1);
  } else {
    const expBase = 1 - Math.exp(-Math.max(0, req.days_since_rain) / DROUGHT_TAU_DAYS);
    droughtFactor = clamp(DROUGHT_FLOOR + (1 - DROUGHT_FLOOR) * expBase, DROUGHT_FLOOR, 1);
  }

  // Seasonal/vegetation multiplier — NDVI overrides season when available.
  // ndvi_factor = clamp(0.80 - anomaly, 0.40, 1.00). Sign convention:
  // negative anomaly (drier than normal) → higher factor → higher risk.
  const seasonal = effectiveNdvi != null
    ? clamp(0.8 - effectiveNdvi, 0.4, 1)
    : SEASON_MULT[req.season];

  // V4 multiplicative
  const raw = Math.pow(vpdFactor, EXP_VPD) * Math.pow(windFactor, EXP_WIND) * Math.pow(droughtFactor, EXP_DROUGHT);
  const score = clamp01(seasonal * raw);

  const level: RiskResponse['danger_level'] =
    score < 0.3 ? 'LOW' :
    score < 0.6 ? 'MODERATE' :
    score < 0.8 ? 'HIGH' : 'EXTREME';

  const thresholds = inferredState ? REGIONAL_THRESHOLDS[inferredState] : null;
  const regionalLevel = thresholds ? regionalBucket(score, thresholds) : null;

  return {
    risk_score: Number(score.toFixed(4)),
    danger_level: level,
    factors: {
      vpd: Number(vpdFactor.toFixed(4)),
      wind: Number(windFactor.toFixed(4)),
      drought: Number(droughtFactor.toFixed(4)),
      season: Number(seasonal.toFixed(4)),
    },
    regional_level: regionalLevel,
    regional_state: inferredState,
    regional_thresholds: thresholds ?? null,
    kbdi: effectiveKbdi,
    ndvi_anomaly: effectiveNdvi,
  };
}

// Compact mirror of api/data/regional_thresholds.json — used only when
// mocks are enabled so the Status calibration ladder still renders without
// a backend. Trimmed to the four fields the UI actually reads.
const MOCK_CALIBRATION: CalibrationInfo = {
  version: 'v4',
  fitted_at: '2026-05-31',
  algorithm_version: 'v4-mock',
  states_calibrated: ['AZ', 'CA', 'CO', 'FL', 'GA', 'NC', 'NV', 'WA'],
  global_thresholds: { low: 0.3, moderate: 0.6, high: 0.8, extreme: 0.8 },
  states: {
    CA: { n_fires: 100, bbox: [-124, 32, -114, 42], centroid: [37, -120],
          thresholds: { low: 0.25, moderate: 0.29, high: 0.33, extreme: 0.39 },
          score_summary: { min: 0.06, median: 0.25, mean: 0.25, max: 0.45 } },
    FL: { n_fires: 100, bbox: [-87, 24, -80, 31], centroid: [28, -83],
          thresholds: { low: 0.20, moderate: 0.25, high: 0.30, extreme: 0.32 },
          score_summary: { min: 0.08, median: 0.20, mean: 0.21, max: 0.37 } },
    AZ: { n_fires: 100, bbox: [-115, 31, -109, 37], centroid: [34, -112],
          thresholds: { low: 0.31, moderate: 0.37, high: 0.41, extreme: 0.45 },
          score_summary: { min: 0.13, median: 0.31, mean: 0.30, max: 0.49 } },
  },
};

// Mock trajectory — defaults to a 'rising' scenario consistent with
// Berkeley's mock weather (slowly heating + drying through the afternoon).
// Toggle MOCK_TRAJECTORY_TIER below if you need a different demo state.
const MOCK_TRAJECTORY: TrajectoryResponse = {
  tier: 'rising',
  delta_pct: 18.4,
  horizon_hours: 6,
  now: {
    label: 'now',
    iso_time: '2026-05-30T12:00',
    temperature_c: 24.0,
    humidity_pct: 45.0,
    wind_kph: 12.0,
    precipitation_mm: 0.0,
    v4_score: 0.34,
  },
  projected: {
    label: '+6 hr',
    iso_time: '2026-05-30T18:00',
    temperature_c: 30.0,
    humidity_pct: 25.0,
    wind_kph: 22.0,
    precipitation_mm: 0.0,
    v4_score: 0.40,
  },
  dominant_driver: 'vpd',
  // Hour-by-hour series (now .. +6 hr) — a smooth rising afternoon. frames[0]
  // matches `now`, frames[6] matches `projected`.
  frames: [
    { label: 'now',   iso_time: '2026-05-30T12:00', temperature_c: 24.0, humidity_pct: 45.0, wind_kph: 12.0, precipitation_mm: 0.0, v4_score: 0.34 },
    { label: '+1 hr', iso_time: '2026-05-30T13:00', temperature_c: 25.0, humidity_pct: 42.0, wind_kph: 13.5, precipitation_mm: 0.0, v4_score: 0.35 },
    { label: '+2 hr', iso_time: '2026-05-30T14:00', temperature_c: 26.0, humidity_pct: 39.0, wind_kph: 15.0, precipitation_mm: 0.0, v4_score: 0.36 },
    { label: '+3 hr', iso_time: '2026-05-30T15:00', temperature_c: 27.0, humidity_pct: 36.0, wind_kph: 16.5, precipitation_mm: 0.0, v4_score: 0.37 },
    { label: '+4 hr', iso_time: '2026-05-30T16:00', temperature_c: 28.0, humidity_pct: 32.0, wind_kph: 18.0, precipitation_mm: 0.0, v4_score: 0.38 },
    { label: '+5 hr', iso_time: '2026-05-30T17:00', temperature_c: 29.0, humidity_pct: 28.0, wind_kph: 20.0, precipitation_mm: 0.0, v4_score: 0.39 },
    { label: '+6 hr', iso_time: '2026-05-30T18:00', temperature_c: 30.0, humidity_pct: 25.0, wind_kph: 22.0, precipitation_mm: 0.0, v4_score: 0.40 },
  ],
};

export const mockApi = {
  health: () => delay({ ok: true }),
  fires: (_opts?: { days?: number; bbox?: string }) => delay(MOCK_FIRES),
  risk: (body: RiskRequest) => delay(computeMockRisk(body), 320),
  riskCalibration: () => delay(MOCK_CALIBRATION, 120),
  trajectory: (_lat: number, _lon: number): Promise<TrajectoryResponse | null> =>
    delay(MOCK_TRAJECTORY, 280),
  weather: (_lat: number, _lon: number) => delay(MOCK_WEATHER),
  geocode: (query: string): Promise<GeocodeHit[]> => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return delay([]);
    const matches = US_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.state?.toLowerCase() === q),
    ).slice(0, 8);
    return delay(matches);
  },
  shelters: (_lat: number, _lon: number, _radiusMi = 50, limit = 20) =>
    delay(MOCK_SHELTERS.slice(0, limit)),
  incidentsNear: (_lat: number, _lon: number, _radiusMi = 15, limit = 5) =>
    delay(MOCK_INCIDENTS.slice(0, limit)),
  disastersNear: (_lat: number, _lon: number) => delay(MOCK_DISASTERS),
};

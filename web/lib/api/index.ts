// API barrel — dispatches every call to either the real FastAPI backend or
// the in-memory mocks, based on env config. Default is mocks while we build.
//
//   NEXT_PUBLIC_API_URL    URL of the FastAPI server (e.g. http://localhost:8000)
//   NEXT_PUBLIC_USE_MOCKS  'true' to force mocks regardless of API_URL
//
// Mocks are used when USE_MOCKS=true OR when API_URL is empty.

import type {
  CalibrationInfo,
  DisastersNearResponse,
  FireCollection,
  GeocodeHit,
  IgnitionResponse,
  NamedIncident,
  RiskRequest,
  RiskResponse,
  Shelter,
  TrajectoryResponse,
  WeatherResponse,
} from './types';
import { mockApi } from './mocks';
import { reportSourceHealth } from '../source-health';

export * from './types';
export { BERKELEY, MOCK_INCIDENTS } from './mocks';

const RAW_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const FORCE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

export const apiBaseUrl: string = RAW_URL;
export const usingMocks: boolean = FORCE_MOCKS || RAW_URL.length === 0;

async function request<T>(path: string, init?: RequestInit, reportHealth = true): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${text || res.statusText}`);
  }
  // Per-request source health rides in a response header (see
  // lib/source-health.ts). Report it as a side effect so screens can show a
  // "this feed is down" note. Detail/secondary queries pass reportHealth:false
  // so a transient failure on a narrow request (e.g. the fire-detail cluster)
  // doesn't poison the global feed-health the primary screens + sidebar read.
  // Never let a malformed header break the request.
  if (reportHealth) {
    const health = res.headers.get('X-Source-Health');
    if (health) {
      try {
        reportSourceHealth(JSON.parse(health));
      } catch {
        /* ignore malformed health header */
      }
    }
  }
  return (await res.json()) as T;
}

const realApi = {
  health: () => request<{ ok: boolean }>('/healthz'),
  fires: (opts?: { days?: number; bbox?: string; reportHealth?: boolean }) => {
    const qs = new URLSearchParams();
    if (opts?.days) qs.set('days', String(opts.days));
    if (opts?.bbox) qs.set('bbox', opts.bbox);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<FireCollection>(`/fires${suffix}`, undefined, opts?.reportHealth ?? true);
  },
  risk: (body: RiskRequest) =>
    request<RiskResponse>('/risk', { method: 'POST', body: JSON.stringify(body) }),
  riskCalibration: () => request<CalibrationInfo>('/risk/calibration'),
  weather: (lat: number, lon: number) =>
    request<WeatherResponse>(`/weather?lat=${lat}&lon=${lon}`),
  geocode: (query: string) =>
    request<GeocodeHit[]>(`/geocode?q=${encodeURIComponent(query)}`),
  shelters: (lat: number, lon: number, radiusMi = 50, limit = 20) =>
    request<Shelter[]>(`/shelters?lat=${lat}&lon=${lon}&radius_mi=${radiusMi}&limit=${limit}`),
  incidentsNear: (lat: number, lon: number, radiusMi = 15, limit = 5, reportHealth = true) =>
    request<NamedIncident[]>(
      `/incidents/near?lat=${lat}&lon=${lon}&radius_mi=${radiusMi}&limit=${limit}`,
      undefined,
      reportHealth,
    ),
  disastersNear: (lat: number, lon: number) =>
    request<DisastersNearResponse>(`/disasters/near?lat=${lat}&lon=${lon}`),
  trajectory: (lat: number, lon: number) =>
    request<TrajectoryResponse | null>(`/trajectory?lat=${lat}&lon=${lon}`),
  ignition: (lat: number, lon: number) =>
    request<IgnitionResponse | null>(`/ignition?lat=${lat}&lon=${lon}`),
};

export const api = usingMocks ? mockApi : realApi;

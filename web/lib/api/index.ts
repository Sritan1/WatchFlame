// Sends every call to the real backend or to the in-memory mocks.
// NEXT_PUBLIC_API_URL points at the FastAPI server and NEXT_PUBLIC_USE_MOCKS
// forces mocks whatever the URL says. With no API URL set, it falls back to mocks.

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
  // Feed health rides along in a header, see lib/source-health.ts. Detail queries
  // pass reportHealth:false so a blip on their narrow request can't mark a feed
  // down app-wide. A malformed header must never fail the request.
  if (reportHealth) {
    const health = res.headers.get('X-Source-Health');
    if (health) {
      try {
        reportSourceHealth(JSON.parse(health));
      } catch {
        /* ignore a malformed header */
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

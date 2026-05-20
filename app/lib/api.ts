/**
 * API client for the wildfire backend.
 * EXPO_PUBLIC_API_URL is set in app/.env.
 */
import type {
  DisastersNearResponse,
  FireCollection,
  GeocodeHit,
  NamedIncident,
  RiskRequest,
  RiskResponse,
  Shelter,
  WeatherResponse,
} from './types';

const FALLBACK_DEV_URL = 'http://localhost:8000';

export const apiBaseUrl: string =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || FALLBACK_DEV_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/healthz'),

  fires: (opts?: { days?: number; bbox?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.days) qs.set('days', String(opts.days));
    if (opts?.bbox) qs.set('bbox', opts.bbox);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<FireCollection>(`/fires${suffix}`);
  },

  risk: (body: RiskRequest) =>
    request<RiskResponse>('/risk', { method: 'POST', body: JSON.stringify(body) }),

  weather: (lat: number, lon: number) =>
    request<WeatherResponse>(`/weather?lat=${lat}&lon=${lon}`),

  geocode: (query: string) =>
    request<GeocodeHit[]>(`/geocode?q=${encodeURIComponent(query)}`),

  shelters: (lat: number, lon: number, radiusMi = 50, limit = 20) =>
    request<Shelter[]>(
      `/shelters?lat=${lat}&lon=${lon}&radius_mi=${radiusMi}&limit=${limit}`,
    ),

  incidentsNear: (lat: number, lon: number, radiusMi = 15, limit = 5) =>
    request<NamedIncident[]>(
      `/incidents/near?lat=${lat}&lon=${lon}&radius_mi=${radiusMi}&limit=${limit}`,
    ),

  disastersNear: (lat: number, lon: number) =>
    request<DisastersNearResponse>(`/disasters/near?lat=${lat}&lon=${lon}`),
};

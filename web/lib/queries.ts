'use client';

// TanStack Query hooks against the FastAPI backend, or the in-memory mocks.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from './api';
import type { FireCollection, LatLon } from './api';

/** Returns `value` once it has held still for `ms`. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Score a fresh weather reading. Inputs are rounded to whole numbers so both the
 *  what-if sliders and Status send the backend exactly the numbers the user can
 *  see, and their scores agree for the same coordinates. */
export function useRiskFromWeather(
  weather: { temperature: number; humidity: number; wind_speed: number } | undefined,
  coords?: LatLon,
) {
  const tempInt = weather ? Math.round(weather.temperature) : undefined;
  const humidityInt = weather ? Math.round(weather.humidity) : undefined;
  const windInt = weather ? Math.round(weather.wind_speed) : undefined;
  // Season picks the vegetation multiplier, so it belongs in the key. Leave it out
  // and a cached score survives a season change that should have moved it.
  const season = currentSeason();
  return useQuery({
    queryKey: ['risk', tempInt, humidityInt, windInt, coords?.lat, coords?.lon, season],
    queryFn: () =>
      api.risk({
        temperature: tempInt!,
        humidity: humidityInt!,
        wind_speed: windInt!,
        days_since_rain: 7,
        season,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
      }),
    enabled: !!weather,
    staleTime: 5 * 60_000,
  });
}

/** Where the fire-weather score is heading over the next 6 hours. Cached 10
 *  minutes, since the forecast behind it only updates hourly. */
export function useTrajectory(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['trajectory', loc?.lat, loc?.lon],
    queryFn: () => api.trajectory(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 10 * 60_000,
  });
}

/** The model's ignition-likelihood score. Its features come from the Open-Meteo
 *  archive, which lags about 6 days and moves slowly, so cache it hard. */
export function useIgnition(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['ignition', loc?.lat, loc?.lon],
    queryFn: () => api.ignition(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 30 * 60_000,
  });
}

/** Per-state thresholds for the calibration ladder. These only change when
 *  scripts/build_regional_thresholds.py re-runs, so fetch once per session. */
export function useRiskCalibration() {
  return useQuery({
    queryKey: ['risk-calibration'],
    queryFn: () => api.riskCalibration(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Current weather for a point, cached 5 minutes since OpenWeather updates about
 *  every 10. Full coordinate precision in the key, because rounding to 2 decimals used to
 *  merge locations a kilometre apart and serve one city's weather for the other. */
export function useWeather(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['weather', loc?.lat, loc?.lon],
    queryFn: () => api.weather(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 5 * 60_000,
  });
}

// How often the health-reporting queries poll while their screen is focused.
// staleTime alone never refetches, so a feed down at mount stops re-reporting and
// its note ages out while it's still down. Keep every interval under FRESH_MS.
const HEALTH_REFETCH_MS = 15 * 60_000;

/** Satellite fire detections around the user. */
export function useFiresAroundMe(me: LatLon | undefined, radiusMiles = 250) {
  const bbox = me ? bboxAround(me, radiusMiles) : undefined;
  return useQuery<FireCollection>({
    queryKey: ['fires', bbox],
    queryFn: () => api.fires({ days: 1, bbox }),
    enabled: !!me,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

/** Detections clustered around one fire, for the fire-detail view. Passes
 *  reportHealth:false so a blip on this narrow request can't mark FIRMS down for
 *  the Map, Status and the sidebar chip. */
export function useFiresNear(point: LatLon | undefined, radiusMiles = 8, days = 7) {
  const bbox = point ? bboxAround(point, radiusMiles) : undefined;
  return useQuery<FireCollection>({
    queryKey: ['fires-near', bbox, days],
    queryFn: () => api.fires({ days, bbox, reportHealth: false }),
    enabled: !!point,
    staleTime: 5 * 60_000,
  });
}

/** Named NIFC and Cal Fire incidents near a point, carrying the containment,
 *  personnel and evacuation detail satellite pixels don't have. Pass
 *  reportHealth:false from detail screens. */
export function useNamedIncidentsNear(
  point: LatLon | undefined,
  radiusMi = 30,
  limit = 5,
  reportHealth = true,
) {
  return useQuery({
    // reportHealth is in the key on purpose. It changes what a failure does, so
    // callers on the same point must not dedupe into one query where whichever
    // mounted first decides for both.
    queryKey: ['incidents-near', point?.lat, point?.lon, radiusMi, limit, reportHealth],
    queryFn: () => api.incidentsNear(point!.lat, point!.lon, radiusMi, limit, reportHealth),
    enabled: !!point,
    staleTime: 5 * 60_000,
    // Only the reporting callers need to keep polling.
    refetchInterval: reportHealth ? 5 * 60_000 : false,
  });
}

/** Active FEMA disaster declarations covering the user's county. */
export function useActiveDisasters(point: LatLon | undefined) {
  return useQuery({
    queryKey: ['disasters-near', point?.lat, point?.lon],
    queryFn: () => api.disastersNear(point!.lat, point!.lon),
    enabled: !!point,
    staleTime: 15 * 60_000,
    refetchInterval: HEALTH_REFETCH_MS,
  });
}

/** Nearby shelters from OpenStreetMap. */
export function useNearbyShelters(me: LatLon | undefined, radiusMi = 50, limit = 20) {
  return useQuery({
    queryKey: ['shelters', me?.lat, me?.lon, radiusMi, limit],
    queryFn: () => api.shelters(me!.lat, me!.lon, radiusMi, limit),
    enabled: !!me,
    staleTime: 60 * 60_000,
    // Re-check the sources on the health cadence even though the data itself is
    // good for an hour.
    refetchInterval: HEALTH_REFETCH_MS,
  });
}

function currentSeason(): 'winter' | 'spring' | 'summer' | 'fall' {
  const m = new Date().getMonth();
  if (m < 2 || m === 11) return 'winter';
  if (m < 5) return 'spring';
  if (m < 8) return 'summer';
  return 'fall';
}

/** Box around a point, as the comma-joined string the API wants. */
function bboxAround(me: LatLon, radiusMi: number): string {
  const dLat = radiusMi / 69; // about 69 miles to a degree of latitude
  const dLon = radiusMi / (69 * Math.cos((me.lat * Math.PI) / 180));
  return [me.lon - dLon, me.lat - dLat, me.lon + dLon, me.lat + dLat]
    .map((n) => n.toFixed(4))
    .join(',');
}

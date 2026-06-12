'use client';

// TanStack Query hooks against the FastAPI backend (or the in-memory mocks).
// Mirrors app/lib/hooks.ts so screen code reads identically across mobile + web.

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from './api';
import type { FireCollection, LatLon } from './api';

/** Generic value debounce — returns `value` after `ms` of stable input. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Compute risk from a fresh weather reading. 5 min cache + full coord
 *  precision (same reason as useWeather).
 *
 *  Inputs are rounded to the same integer precision the Risk Calculator's
 *  sliders use (`Math.round(localTemp)` etc. in RiskScreen.applyLocal).
 *  Status displays them rounded too (`formatTemp(t, unit, 0)`), so this
 *  guarantees the score on Status's Fire Weather card matches the score on
 *  Risk Calculator for the same coords — both surfaces feed the backend the
 *  same numbers the user sees in the UI. */
export function useRiskFromWeather(
  weather: { temperature: number; humidity: number; wind_speed: number } | undefined,
  coords?: LatLon,
) {
  const tempInt = weather ? Math.round(weather.temperature) : undefined;
  const humidityInt = weather ? Math.round(weather.humidity) : undefined;
  const windInt = weather ? Math.round(weather.wind_speed) : undefined;
  return useQuery({
    queryKey: ['risk', tempInt, humidityInt, windInt, coords?.lat, coords?.lon],
    queryFn: () =>
      api.risk({
        temperature: tempInt!,
        humidity: humidityInt!,
        wind_speed: windInt!,
        days_since_rain: 7,
        season: currentSeason(),
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
      }),
    enabled: !!weather,
    staleTime: 5 * 60_000,
  });
}

/** Short-term forward-looking trajectory for the user's location. Projects
 *  the V4 fire-weather score 6 hours forward using Open-Meteo's hourly
 *  Forecast endpoint and returns one of three tiers (rising / steady /
 *  falling) plus per-frame weather + dominant driver. Drives the Status
 *  trajectory chip and the 2D phase-space arrow.
 *
 *  10 min staleTime — the forecast itself updates hourly upstream and
 *  the operationally interesting signal (next 6 hr) doesn't shift faster
 *  than that. Returns `null` cleanly on upstream failure (matches the
 *  backend's graceful-degrade contract). */
export function useTrajectory(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['trajectory', loc?.lat, loc?.lon],
    queryFn: () => api.trajectory(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 10 * 60_000,
  });
}

/** Machine-learning fire-ignition-likelihood index for a location. Backed by
 *  `/ignition`, which derives features from the Open-Meteo archive (lags ~6
 *  days and changes slowly), so a long staleTime is plenty. Returns `null`
 *  cleanly when the model can't score the location. */
export function useIgnition(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['ignition', loc?.lat, loc?.lon],
    queryFn: () => api.ignition(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 30 * 60_000,
  });
}

/** Per-state calibration thresholds + metadata for the Status calibration
 *  ladder. Backed by `/risk/calibration` which is essentially static —
 *  values change only when scripts/build_regional_thresholds.py re-runs,
 *  so we treat this as a long-lived session-level cache. */
export function useRiskCalibration() {
  return useQuery({
    queryKey: ['risk-calibration'],
    queryFn: () => api.riskCalibration(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Current weather for a point. Cache for 5 min (OWM updates every ~10 min)
 *  and use FULL coord precision in the queryKey — the previous .toFixed(2)
 *  silently collided neighboring locations (~1.1 km cell), serving stale
 *  data when you switched between two nearby cities. */
export function useWeather(loc: LatLon | undefined) {
  return useQuery({
    queryKey: ['weather', loc?.lat, loc?.lon],
    queryFn: () => api.weather(loc!.lat, loc!.lon),
    enabled: !!loc,
    staleTime: 5 * 60_000,
  });
}

/** Satellite fire detections around the user. */
export function useFiresAroundMe(me: LatLon | undefined, radiusMiles = 250) {
  const bbox = me ? bboxAround(me, radiusMiles) : undefined;
  return useQuery<FireCollection>({
    queryKey: ['fires', bbox],
    queryFn: () => api.fires({ days: 1, bbox }),
    enabled: !!me,
    staleTime: 10 * 60_000,
  });
}

/** Local cluster of detections around a single fire — for fire-detail view. */
export function useFiresNear(point: LatLon | undefined, radiusMiles = 8, days = 7) {
  const bbox = point ? bboxAround(point, radiusMiles) : undefined;
  return useQuery<FireCollection>({
    queryKey: ['fires-near', bbox, days],
    queryFn: () => api.fires({ days, bbox }),
    enabled: !!point,
    staleTime: 5 * 60_000,
  });
}

/** Named NIFC/Cal Fire incidents near a point — provides management metadata
 *  (containment, personnel, evac statements) that satellite detections lack. */
export function useNamedIncidentsNear(point: LatLon | undefined, radiusMi = 30, limit = 5) {
  return useQuery({
    queryKey: ['incidents-near', point?.lat, point?.lon, radiusMi, limit],
    queryFn: () => api.incidentsNear(point!.lat, point!.lon, radiusMi, limit),
    enabled: !!point,
    staleTime: 5 * 60_000,
  });
}

/** Active FEMA disaster declarations covering the user's county. */
export function useActiveDisasters(point: LatLon | undefined) {
  return useQuery({
    queryKey: ['disasters-near', point?.lat, point?.lon],
    queryFn: () => api.disastersNear(point!.lat, point!.lon),
    enabled: !!point,
    staleTime: 15 * 60_000,
  });
}

/** Nearby shelters from OpenStreetMap. */
export function useNearbyShelters(me: LatLon | undefined, radiusMi = 50, limit = 20) {
  return useQuery({
    queryKey: ['shelters', me?.lat, me?.lon, radiusMi, limit],
    queryFn: () => api.shelters(me!.lat, me!.lon, radiusMi, limit),
    enabled: !!me,
    staleTime: 60 * 60_000,
  });
}

// ─── Tiny helpers (kept local so this file is self-contained) ───────────────

function currentSeason(): 'winter' | 'spring' | 'summer' | 'fall' {
  const m = new Date().getMonth();
  if (m < 2 || m === 11) return 'winter';
  if (m < 5) return 'spring';
  if (m < 8) return 'summer';
  return 'fall';
}

/** Bounding box `lonW,latS,lonE,latN` for `radiusMi` around `me`, formatted as
 *  the API expects. */
function bboxAround(me: LatLon, radiusMi: number): string {
  const dLat = radiusMi / 69; // ~69 mi per degree of latitude
  const dLon = radiusMi / (69 * Math.cos((me.lat * Math.PI) / 180));
  return [me.lon - dLon, me.lat - dLat, me.lon + dLon, me.lat + dLat]
    .map((n) => n.toFixed(4))
    .join(',');
}

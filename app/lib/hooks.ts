import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { api } from './api';
import { bboxAround, nearestFire } from './geo';
import { useSavedLocations } from './locations';
import { currentSeason } from './season';
import type { FireCollection, LatLon, RiskRequest } from './types';

/** Generic value debounce — returns `value` after `ms` of stable input. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Compute risk for arbitrary inputs (used by the Risk Calculator screen). */
export function useRiskForInputs(input: RiskRequest, debounceMs = 250) {
  const debounced = useDebounced(input, debounceMs);
  return useQuery({
    queryKey: [
      'risk',
      debounced.temperature,
      debounced.humidity,
      debounced.wind_speed,
      debounced.days_since_rain,
      debounced.season,
      debounced.kbdi,
      debounced.ndvi_anomaly,
      debounced.state,
    ],
    queryFn: () => api.risk(debounced),
    staleTime: 60_000,
  });
}

/** Fallback location (Boulder, CO) — matches the Status mockup. */
const FALLBACK: LatLon = { lat: 40.0150, lon: -105.2705 };

type LocationState = {
  coords: LatLon;
  isFallback: boolean;
  permission: 'unknown' | 'granted' | 'denied' | 'pending';
};

/** Ask once for foreground location; fall back to Boulder if denied. */
export function useUserLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    coords: FALLBACK,
    isFallback: true,
    permission: 'pending',
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setState({ coords: FALLBACK, isFallback: true, permission: 'denied' });
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!alive) return;
        setState({
          coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          isFallback: false,
          permission: 'granted',
        });
      } catch {
        setState({ coords: FALLBACK, isFallback: true, permission: 'granted' });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/**
 * Resolves the "current location" the rest of the app should use.
 * If the user has selected a saved location, that wins; otherwise GPS.
 */
export function useActiveLocation(): {
  coords: LatLon;
  label: string;
  isGps: boolean;
  permission: LocationState['permission'];
} {
  const gps = useUserLocation();
  const { active } = useSavedLocations();
  if (active) {
    return {
      coords: { lat: active.lat, lon: active.lon },
      label: active.label,
      isGps: false,
      permission: gps.permission,
    };
  }
  return {
    coords: gps.coords,
    label: gps.isFallback ? 'Boulder, Colorado' : 'My Location',
    isGps: true,
    permission: gps.permission,
  };
}

/** Fetch fires around the user from the backend. */
export function useFiresAroundMe(me: LatLon, radiusMiles = 250) {
  const bbox = bboxAround(me, radiusMiles);
  return useQuery<FireCollection>({
    queryKey: ['fires', bbox],
    queryFn: () => api.fires({ days: 1, bbox }),
    // NASA FIRMS satellite passes are ~4 hours apart and the data lags
    // detection by another ~4 hours, so anything tighter than 10 min is
    // just refetching the same payload. Pull-to-refresh still works.
    staleTime: 10 * 60_000,
  });
}

/** Fetch active FEMA disaster declarations covering the user's county. */
export function useActiveDisasters(point: LatLon) {
  return useQuery({
    queryKey: ['disasters-near', point.lat.toFixed(2), point.lon.toFixed(2)],
    queryFn: () => api.disastersNear(point.lat, point.lon),
    staleTime: 15 * 60_000, // matches server-side cache
  });
}

/** Fetch named incidents (NIFC + Cal Fire) near a point. Used to enrich
 *  satellite point detections with management metadata when available. */
export function useNamedIncidentsNear(point: LatLon, radiusMi = 15, limit = 5) {
  return useQuery({
    queryKey: ['incidents-near', point.lat.toFixed(2), point.lon.toFixed(2), radiusMi],
    queryFn: () => api.incidentsNear(point.lat, point.lon, radiusMi, limit),
    staleTime: 10 * 60_000, // matches server-side cache
  });
}

/** Fetch potential nearby shelters from OpenStreetMap via the backend. */
export function useNearbyShelters(me: LatLon, radiusMi = 50, limit = 20) {
  return useQuery({
    queryKey: ['shelters', me.lat.toFixed(2), me.lon.toFixed(2), radiusMi, limit],
    queryFn: () => api.shelters(me.lat, me.lon, radiusMi, limit),
    staleTime: 60 * 60_000, // 1 hour — Overpass cached server-side too
  });
}

/** Fetch the local cluster of detections around a single fire (active extent). */
export function useFiresNear(point: LatLon, radiusMiles = 8, days = 7) {
  const bbox = bboxAround(point, radiusMiles);
  return useQuery<FireCollection>({
    queryKey: ['fires-near', bbox, days],
    queryFn: () => api.fires({ days, bbox }),
    staleTime: 5 * 60_000,
  });
}

/** Compute the nearest fire to me from the fire list. */
export function useNearestFire(me: LatLon, fires: FireCollection | undefined) {
  if (!fires) return null;
  return nearestFire(me, fires.features);
}

/** Fetch current weather for a location. */
export function useWeather(loc: LatLon) {
  return useQuery({
    queryKey: ['weather', loc.lat.toFixed(2), loc.lon.toFixed(2)],
    queryFn: () => api.weather(loc.lat, loc.lon),
    // OWM updates every ~10 min upstream; bumping to 15 min cuts roughly
    // one third of the refetches without meaningfully aging the data.
    staleTime: 15 * 60_000,
  });
}

/**
 * Compute risk from a weather snapshot. When `coords` is supplied the backend
 * swaps in real KBDI and returns a per-state `regional_level` alongside the
 * global `danger_level`. Without coords the days_since_rain proxy (=7) is used.
 */
export function useRiskFromWeather(
  weather: { temperature: number; humidity: number; wind_speed: number } | undefined,
  coords?: LatLon,
) {
  return useQuery({
    queryKey: [
      'risk',
      weather?.temperature,
      weather?.humidity,
      weather?.wind_speed,
      coords?.lat.toFixed(2),
      coords?.lon.toFixed(2),
    ],
    queryFn: () =>
      api.risk({
        temperature: weather!.temperature,
        humidity: weather!.humidity,
        wind_speed: weather!.wind_speed,
        days_since_rain: 7,
        season: currentSeason(),
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
      }),
    enabled: !!weather,
    // Risk depends on weather (15 min) + KBDI (6 hr) + NDVI (7 d) — all
    // upstream cadences are at least 15 min, so a 15-min staleTime here
    // avoids refetching for unchanged inputs while staying current.
    staleTime: 15 * 60_000,
  });
}

'use client';

// Active focus point for the app. Resolves to:
//   1. The user's selected saved location (if any), OR
//   2. The device's GPS coords (if granted), OR
//   3. Berkeley, CA as fallback.
// The mobile equivalent is lib/hooks.ts's useActiveLocation.

import { useEffect, useMemo, useState } from 'react';

import { BERKELEY } from './api';
import type { LatLon } from './api';
import { useSavedLocations } from './use-saved-locations';

export type LocationPermission = 'unknown' | 'pending' | 'granted' | 'denied' | 'unavailable';

export interface LocationState {
  coords: LatLon;
  /** Human-readable label, e.g. "Berkeley, CA" or "My Location". */
  label: string;
  /** True when coords come from the Berkeley fallback rather than the device. */
  isFallback: boolean;
  /** True when coords come from a saved location selection (overrides GPS). */
  isSaved: boolean;
  permission: LocationPermission;
}

const FALLBACK_COORDS: LatLon = { lat: BERKELEY.lat, lon: BERKELEY.lon };

interface GpsState {
  coords: LatLon;
  isFallback: boolean;
  permission: LocationPermission;
}

const INITIAL_GPS: GpsState = {
  coords: FALLBACK_COORDS,
  isFallback: true,
  permission: 'pending',
};

/** Internal hook — talks to navigator.geolocation only (no saved-locations layer). */
function useDeviceGps(): GpsState {
  const [state, setState] = useState<GpsState>(INITIAL_GPS);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ ...INITIAL_GPS, permission: 'unavailable' });
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive) return;
        setState({
          coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          isFallback: false,
          permission: 'granted',
        });
      },
      (err) => {
        if (!alive) return;
        setState({
          ...INITIAL_GPS,
          permission: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** What every screen should call. Honors saved-location override, else GPS, else fallback.
 *
 *  Coords identity must stay stable across renders when nothing actually changed —
 *  consumers downstream use `loc.coords` as a `useMemo` dependency (threat aggregation,
 *  confidence calc, etc.). Without memoization here, the saved-location branch returned
 *  a fresh `{ lat, lon }` literal on every render, invalidating every dependent memo
 *  in the tree and re-running threat aggregation on each tick. */
export function useUserLocation(): LocationState {
  const gps = useDeviceGps();
  const { items, activeId } = useSavedLocations();

  const active = activeId ? items.find((i) => i.id === activeId) : undefined;
  const savedLat = active?.lat;
  const savedLon = active?.lon;
  // Memoize by primitive (lat/lon) so identity only changes when coords change.
  const savedCoords = useMemo<LatLon | null>(
    () => (savedLat != null && savedLon != null ? { lat: savedLat, lon: savedLon } : null),
    [savedLat, savedLon],
  );

  if (active && savedCoords) {
    return {
      coords: savedCoords,
      label: active.label,
      isFallback: false,
      isSaved: true,
      permission: gps.permission,
    };
  }

  return {
    coords: gps.coords,
    label: gps.isFallback ? 'Berkeley, CA' : 'My Location',
    isFallback: gps.isFallback,
    isSaved: false,
    permission: gps.permission,
  };
}

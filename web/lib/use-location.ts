'use client';

// Active focus point for the app. Resolves to:
//   1. The user's selected saved location (if any), OR
//   2. The device's GPS coords (if granted), OR
//   3. Berkeley, CA as fallback.
// The mobile equivalent is lib/hooks.ts's useActiveLocation.

import { useEffect, useMemo, useSyncExternalStore } from 'react';

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
  /** True when the device GPS resolved outside the US and we fell back to the
   *  default — the app's incident / shelter / FEMA data is US-only. */
  outsideUs: boolean;
  permission: LocationPermission;
}

const FALLBACK_COORDS: LatLon = { lat: BERKELEY.lat, lon: BERKELEY.lon };

interface GpsState {
  coords: LatLon;
  isFallback: boolean;
  /** GPS resolved to a location outside the US, so we fell back to the default. */
  outsideUs: boolean;
  permission: LocationPermission;
}

const INITIAL_GPS: GpsState = {
  coords: FALLBACK_COORDS,
  isFallback: true,
  outsideUs: false,
  permission: 'pending',
};

/** Coarse US-membership check (CONUS + Alaska + Hawaii boxes). The app's
 *  incident / shelter / FEMA / calibration data is US-only, so a device GPS fix
 *  outside these boxes is unusable and we fall back to the default. The boxes
 *  overlap a little into southern Canada / northern Mexico — an accepted edge,
 *  since the US-only data degrades gracefully there anyway. */
function isInUS(lat: number, lon: number): boolean {
  if (lat >= 24.4 && lat <= 49.5 && lon >= -125.0 && lon <= -66.9) return true; // CONUS
  if (lat >= 51.0 && lat <= 71.6 && lon >= -170.0 && lon <= -129.0) return true; // Alaska
  if (lat >= 18.8 && lat <= 22.3 && lon >= -160.3 && lon <= -154.7) return true; // Hawaii
  return false;
}

// ─── Shared device-GPS store ────────────────────────────────────────────────
// A SINGLE navigator.geolocation lookup, shared across every useUserLocation()
// caller (Shell, Status, Risk, ...). Backed by a module store (like
// source-health / modal-state) rather than per-hook useState, so multiple
// callers never fire duplicate permission prompts or resolve to two different
// positions that then disagree (e.g. the Shell "location is off" banner vs the
// coords actually feeding the queries).

let gpsState: GpsState = INITIAL_GPS;
const gpsListeners = new Set<() => void>();
let gpsInFlight = false;

function setGpsState(next: GpsState): void {
  gpsState = next;
  gpsListeners.forEach((l) => l());
}

/** Kick off the geolocation lookup. Runs at most one lookup at a time, and skips
 *  entirely once we already hold a granted fix (it's cached and reused, never
 *  re-prompted). It DOES retry when the last attempt failed (permission 'denied'
 *  / 'unavailable') — so if the user grants access after an initial denial and
 *  switches back to "My Location", the fix is picked up without a page reload. */
function ensureGpsLookup(): void {
  if (gpsInFlight) return;
  if (gpsState.permission === 'granted') return; // already have a usable fix
  gpsInFlight = true;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    gpsInFlight = false;
    setGpsState({ ...INITIAL_GPS, permission: 'unavailable' });
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsInFlight = false;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      if (isInUS(lat, lon)) {
        setGpsState({ coords: { lat, lon }, isFallback: false, outsideUs: false, permission: 'granted' });
      } else {
        // Foreign GPS fix — the app's US-only data (incidents, shelters, FEMA,
        // calibration) would be a broken half-experience, so fall back to the
        // default and flag it so the Shell can explain.
        setGpsState({ coords: FALLBACK_COORDS, isFallback: true, outsideUs: true, permission: 'granted' });
      }
    },
    (err) => {
      gpsInFlight = false;
      setGpsState({
        ...INITIAL_GPS,
        permission: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
      });
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
  );
}

function subscribeGps(listener: () => void): () => void {
  gpsListeners.add(listener);
  return () => {
    gpsListeners.delete(listener);
  };
}

function getGpsSnapshot(): GpsState {
  return gpsState;
}

/** Internal hook — shared navigator.geolocation state (no saved-locations
 *  layer). `enabled` is false when a saved location is overriding GPS, so we
 *  don't fire a permission prompt whose result would just be discarded. The
 *  underlying lookup is shared + deduped across all enabled callers and reused
 *  once a fix is granted; see ensureGpsLookup for the retry-on-failure rule. */
function useDeviceGps(enabled: boolean): GpsState {
  const state = useSyncExternalStore(subscribeGps, getGpsSnapshot, getGpsSnapshot);
  useEffect(() => {
    if (enabled) ensureGpsLookup();
  }, [enabled]);
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
  const { items, activeId } = useSavedLocations();

  const active = activeId ? items.find((i) => i.id === activeId) : undefined;
  const savedLat = active?.lat;
  const savedLon = active?.lon;
  // Memoize by primitive (lat/lon) so identity only changes when coords change.
  const savedCoords = useMemo<LatLon | null>(
    () => (savedLat != null && savedLon != null ? { lat: savedLat, lon: savedLon } : null),
    [savedLat, savedLon],
  );

  // Only reach for GPS when no saved location is overriding it — otherwise the
  // GPS result is discarded anyway and the permission prompt is pure friction.
  const gps = useDeviceGps(!(active && savedCoords));

  if (active && savedCoords) {
    return {
      coords: savedCoords,
      label: active.label,
      isFallback: false,
      isSaved: true,
      outsideUs: false,
      permission: gps.permission,
    };
  }

  return {
    coords: gps.coords,
    label: gps.isFallback ? 'Berkeley, CA' : 'My Location',
    isFallback: gps.isFallback,
    isSaved: false,
    outsideUs: gps.outsideUs,
    permission: gps.permission,
  };
}

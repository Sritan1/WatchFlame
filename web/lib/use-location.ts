'use client';

// Where the app is currently looking. A saved location if one is selected, the
// device's GPS fix if we have it, or Berkeley, CA as a last resort.

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { BERKELEY } from './api';
import type { LatLon } from './api';
import { useSavedLocations } from './use-saved-locations';

export type LocationPermission = 'unknown' | 'pending' | 'granted' | 'denied' | 'unavailable';

export interface LocationState {
  coords: LatLon;
  /** What to call it on screen, like "Berkeley, CA" or "My Location". */
  label: string;
  /** These are the fallback coords, not the device's. */
  isFallback: boolean;
  /** A saved location is overriding GPS. */
  isSaved: boolean;
  /** GPS put us outside the US, so we fell back. The data is all US-only. */
  outsideUs: boolean;
  permission: LocationPermission;
}

const FALLBACK_COORDS: LatLon = { lat: BERKELEY.lat, lon: BERKELEY.lon };

interface GpsState {
  coords: LatLon;
  isFallback: boolean;
  /** GPS landed outside the US, so we fell back to the default. */
  outsideUs: boolean;
  permission: LocationPermission;
}

const INITIAL_GPS: GpsState = {
  coords: FALLBACK_COORDS,
  isFallback: true,
  outsideUs: false,
  permission: 'pending',
};

/** Rough "are we in the US" check against three boxes. They spill a little into
 *  Canada and Mexico, which is fine since the data just thins out there. */
function isInUS(lat: number, lon: number): boolean {
  if (lat >= 24.4 && lat <= 49.5 && lon >= -125.0 && lon <= -66.9) return true; // CONUS
  if (lat >= 51.0 && lat <= 71.6 && lon >= -170.0 && lon <= -129.0) return true; // Alaska
  if (lat >= 18.8 && lat <= 22.3 && lon >= -160.3 && lon <= -154.7) return true; // Hawaii
  return false;
}

// One geolocation lookup for the whole app. A module store rather than per-hook
// state, so callers can't each prompt for permission or land on two positions
// that disagree.

let gpsState: GpsState = INITIAL_GPS;
const gpsListeners = new Set<() => void>();
let gpsInFlight = false;

function setGpsState(next: GpsState): void {
  gpsState = next;
  gpsListeners.forEach((l) => l());
}

/** Start the geolocation lookup, one at a time. It retries after a failure, so
 *  granting access following an earlier denial works without a page reload. */
function ensureGpsLookup(): void {
  if (gpsInFlight) return;
  if (gpsState.permission === 'granted') return; // already have a fix
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
        // Abroad, where every data source comes up empty. Flag it so the Shell
        // can say why.
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

/** The raw GPS state, without the saved-location layer on top. Pass enabled false
 *  when a saved location already overrides GPS, so no permission prompt fires for
 *  an answer that would be thrown away. */
function useDeviceGps(enabled: boolean): GpsState {
  const state = useSyncExternalStore(subscribeGps, getGpsSnapshot, getGpsSnapshot);
  useEffect(() => {
    if (enabled) ensureGpsLookup();
  }, [enabled]);
  return state;
}

/** What every screen calls. Saved location first, then GPS, then the fallback.
 *  coords has to keep the same identity between renders when nothing moved. Half
 *  the app memos on it, and a fresh literal re-runs threat aggregation every tick. */
export function useUserLocation(): LocationState {
  const { items, activeId } = useSavedLocations();

  const active = activeId ? items.find((i) => i.id === activeId) : undefined;
  const savedLat = active?.lat;
  const savedLon = active?.lon;
  // Keyed on the numbers, so identity only changes when the position does.
  const savedCoords = useMemo<LatLon | null>(
    () => (savedLat != null && savedLon != null ? { lat: savedLat, lon: savedLon } : null),
    [savedLat, savedLon],
  );

  // No point prompting for GPS we would only discard.
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

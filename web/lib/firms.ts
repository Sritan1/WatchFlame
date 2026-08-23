// Display helpers for NASA FIRMS detections. FIRMS reports the satellite as a short
// code, so "N" or "NPP" for Suomi NPP, which on screen reads like a typo.
// Mapped to mission names here, once, for both the map rail and fire-detail.

import type { FireFeature } from './api/types';

const FIRMS_PLATFORMS: Record<string, string> = {
  N: 'Suomi NPP',
  NPP: 'Suomi NPP',
  N20: 'NOAA-20',
  J1: 'NOAA-20',
  N21: 'NOAA-21',
  J2: 'NOAA-21',
  T: 'Terra',
  TERRA: 'Terra',
  A: 'Aqua',
  AQUA: 'Aqua',
};

/** Mission name for a satellite code, null if we don't know the code. */
export function firmsPlatform(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  if (!c) return null;
  return FIRMS_PLATFORMS[c] ?? FIRMS_PLATFORMS[c.toUpperCase()] ?? null;
}

/** Card title, "Suomi NPP detection". Never falls back to the raw code. */
export function satelliteTitle(code: string | null | undefined): string {
  const platform = firmsPlatform(code);
  return platform ? `${platform} detection` : 'Satellite detection';
}

/** Confidence label, handling both the VIIRS letters and the MODIS 0-100 numbers
 *  so it survives a switch of sensor. */
export function confidenceLabel(c: string | null): string {
  if (c == null) return '—';
  const v = c.trim().toUpperCase();
  // Catch a blank before the numeric branch, since Number('') is 0 and would
  // invent a "Low" reading out of nothing.
  if (v === '') return '—';
  if (v === 'L') return 'Low';
  if (v === 'N') return 'Nominal';
  if (v === 'H') return 'High';
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n >= 80) return 'High';
    if (n >= 30) return 'Nominal';
    return 'Low';
  }
  return '—';
}

/** Identity for a satellite pixel, so a click selects the same detection in the rail
 *  and on the map. Needs the acquisition time as well as the coordinates. A fire
 *  burning for days hits the same pixel center every overpass. */
export function satKey(f: FireFeature): string {
  const p = f.properties;
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}@${p.acq_date ?? ''}T${p.acq_time ?? ''}`;
}

/** The /fire-detail URL for a detection, so the Status threat card and the map
 *  rail link to the same thing. */
export function firmsDetailHref(feature: FireFeature): string {
  const p = feature.properties;
  const params = new URLSearchParams();
  params.set('lat', String(p.lat));
  params.set('lon', String(p.lon));
  if (p.brightness != null) params.set('brightness', String(p.brightness));
  if (p.confidence != null) params.set('confidence', p.confidence);
  if (p.acq_date != null) params.set('acq_date', p.acq_date);
  if (p.acq_time != null) params.set('acq_time', p.acq_time);
  if (p.satellite != null) params.set('satellite', p.satellite);
  if (p.daynight != null) params.set('daynight', p.daynight);
  return `/fire-detail?${params.toString()}`;
}

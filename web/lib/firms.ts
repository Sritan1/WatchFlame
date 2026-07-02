// Display helpers for NASA FIRMS satellite detections.
//
// The FIRMS area API returns a terse `satellite` code (e.g. "N" for the Suomi
// NPP VIIRS instrument, the default source) that's meaningless to a user and
// reads like a typo in the UI ("N detection"). Map the known platform codes to
// their mission names in one place, shared by the map rail and fire-detail.

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

/** Friendly platform/mission name for a FIRMS `satellite` code, or null when
 *  the code is empty or unrecognized. */
export function firmsPlatform(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  if (!c) return null;
  return FIRMS_PLATFORMS[c] ?? FIRMS_PLATFORMS[c.toUpperCase()] ?? null;
}

/** Title for a satellite detection card/footer — "Suomi NPP detection" when the
 *  platform is known, else a clean generic that never exposes the raw code. */
export function satelliteTitle(code: string | null | undefined): string {
  const platform = firmsPlatform(code);
  return platform ? `${platform} detection` : 'Satellite detection';
}

/** User-facing label for a FIRMS detection's confidence field. Handles both the
 *  categorical VIIRS codes (L/N/H, the default source) and MODIS's numeric
 *  0-100 scale, so it stays correct if FIRMS_SOURCE switches sensors. Returns
 *  '—' when the value is missing or unrecognized. */
export function confidenceLabel(c: string | null): string {
  if (c == null) return '—';
  const v = c.trim().toUpperCase();
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

import type { FireFeature, LatLon } from './types';

/** Haversine distance in miles between two lat/lon points. */
export function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Pick the closest fire to `me` from a list. Null if list is empty. */
export function nearestFire(
  me: LatLon,
  fires: FireFeature[],
): { fire: FireFeature; distance: number } | null {
  if (!fires.length) return null;
  let best: FireFeature = fires[0];
  let bestD = distanceMiles(me, { lat: best.properties.lat, lon: best.properties.lon });
  for (let i = 1; i < fires.length; i++) {
    const f = fires[i];
    const d = distanceMiles(me, { lat: f.properties.lat, lon: f.properties.lon });
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return { fire: best, distance: bestD };
}

/** Build a bbox query string covering ~radius miles around a point. Used for /fires. */
export function bboxAround(me: LatLon, radiusMiles: number): string {
  const milesPerDegLat = 69.0;
  const milesPerDegLon = 69.0 * Math.cos((me.lat * Math.PI) / 180);
  const dLat = radiusMiles / milesPerDegLat;
  const dLon = radiusMiles / Math.max(milesPerDegLon, 1);
  return [me.lon - dLon, me.lat - dLat, me.lon + dLon, me.lat + dLat]
    .map((v) => v.toFixed(4))
    .join(',');
}

/** Approximate radius (meters) for a circle whose area equals the given acres.
 *  Used to render named-incident footprints on the map proportional to size. */
export function acresToRadiusMeters(acres: number): number {
  const m2 = acres * 4046.8564224; // 1 acre in square meters
  return Math.sqrt(m2 / Math.PI);
}

/** Cardinal compass bearing (e.g., "NE", "SSW") for a 0-360° angle. */
export function compassBearing(deg: number): string {
  const labels = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return labels[idx];
}

/** Compute a destination point given a starting point, distance (miles),
 *  and forward bearing (degrees, 0=N, clockwise). Spherical-Earth approximation. */
export function pointAt(from: LatLon, distanceMi: number, bearingDegrees: number): LatLon {
  const R = 3958.7613; // Earth radius (mi)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const ang = distanceMi / R;
  const brg = toRad(bearingDegrees);
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brg),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

/** Bearing in degrees from `from` to `to`, 0=N clockwise. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

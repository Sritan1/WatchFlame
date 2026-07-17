// Away-from-fire destination resolution for the Safety EvacuationCard.
//
// The naive route is a point `distMi` straight opposite the fire. Near a coast
// that can land in open water (Google Maps can't route there), so we resolve a
// sensible destination through a fallback chain, using the coarse land check in
// landmask.ts:
//   1. primary   — the straight-away point, if it's on land
//   2. rotated   — the point at ±arc° of the away bearing, if on land
//   3. shelter   — the nearest shelter whose bearing is within ±arc° of "away"
//                  (so we never send someone toward the fire)
//   4. direction — nothing routable: show a heading only, no drive-to point

import type { LatLon, Shelter } from '@/lib/api';
import { bearingTo } from '@/lib/composite-risk';
import { isOnLand } from '@/lib/landmask';

export type EvacResolution =
  | { kind: 'primary'; bearing: number; dest: LatLon }
  | { kind: 'rotated'; bearing: number; dest: LatLon; rotationDeg: number }
  | { kind: 'shelter'; bearing: number; dest: LatLon; shelter: Shelter }
  | { kind: 'direction'; bearing: number };

/** Destination lat/lon `distMi` from `origin` along `bearingDeg` (great-circle). */
export function destPoint(origin: LatLon, bearingDeg: number, distMi: number): LatLon {
  const R = 3958.8; // Earth radius, miles
  const d = distMi / R;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (origin.lat * Math.PI) / 180;
  const l1 = (origin.lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 =
    l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lon: (l2 * 180) / Math.PI };
}

/** Smallest absolute difference between two bearings, 0..180. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Resolve the away-from-fire destination, avoiding open water. `escapeBearing`
 *  is the direction to flee (opposite the fire). `shelters` may be undefined
 *  while loading — the caller distinguishes that from a real 'direction' result. */
export function resolveEvacDestination(
  origin: LatLon,
  escapeBearing: number,
  distMi: number,
  shelters: Shelter[] | undefined,
  arcDeg = 60,
): EvacResolution {
  // 1. straight away from the fire
  const primary = destPoint(origin, escapeBearing, distMi);
  if (isOnLand(primary.lat, primary.lon)) {
    return { kind: 'primary', bearing: escapeBearing, dest: primary };
  }

  // 2. rotate ±arc° (check +arc, then -arc; first on land wins — both are
  //    equally "away", so order is arbitrary per the design)
  for (const rot of [arcDeg, -arcDeg]) {
    const bearing = (escapeBearing + rot + 360) % 360;
    const dest = destPoint(origin, bearing, distMi);
    if (isOnLand(dest.lat, dest.lon)) {
      return { kind: 'rotated', bearing, dest, rotationDeg: rot };
    }
  }

  // 3. nearest shelter within the ±arc° "away" arc (never toward the fire)
  const shelter = (shelters ?? [])
    .filter(
      (s) => angleDiff(bearingTo(origin, { lat: s.lat, lon: s.lon }), escapeBearing) <= arcDeg,
    )
    .sort((a, b) => a.distance_mi - b.distance_mi)[0];
  if (shelter) {
    const dest = { lat: shelter.lat, lon: shelter.lon };
    return { kind: 'shelter', bearing: bearingTo(origin, dest), dest, shelter };
  }

  // 4. nothing routable
  return { kind: 'direction', bearing: escapeBearing };
}

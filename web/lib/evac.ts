// Where "away from the fire" actually points, for the Safety card. Straight opposite
// is obvious but on a coast lands you in the ocean, so it falls back through
// swung-aside points, a shelter in that arc, then a bare heading. Never at the fire.

import type { LatLon, Shelter } from '@/lib/api';
import { bearingTo } from '@/lib/composite-risk';
import { isOnLand } from '@/lib/landmask';

export type EvacResolution =
  | { kind: 'primary'; bearing: number; dest: LatLon }
  | { kind: 'rotated'; bearing: number; dest: LatLon; rotationDeg: number }
  | { kind: 'shelter'; bearing: number; dest: LatLon; shelter: Shelter }
  | { kind: 'direction'; bearing: number };

/** The point that far from the origin along that bearing. */
export function destPoint(origin: LatLon, bearingDeg: number, distMi: number): LatLon {
  const R = 3958.8; // earth radius in miles
  const d = distMi / R;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (origin.lat * Math.PI) / 180;
  const l1 = (origin.lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 =
    l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lon: (l2 * 180) / Math.PI };
}

/** Smallest angle between two bearings, 0 to 180. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Pick somewhere to go, keeping off the water. shelters can be undefined while
 *  they load, which the caller reads differently from a real 'direction' answer. */
export function resolveEvacDestination(
  origin: LatLon,
  escapeBearing: number,
  distMi: number,
  shelters: Shelter[] | undefined,
  arcDeg = 60,
): EvacResolution {
  const primary = destPoint(origin, escapeBearing, distMi);
  if (isOnLand(primary.lat, primary.lon)) {
    return { kind: 'primary', bearing: escapeBearing, dest: primary };
  }

  // Swing either side of it. Both count as away, so first on land wins.
  for (const rot of [arcDeg, -arcDeg]) {
    const bearing = (escapeBearing + rot + 360) % 360;
    const dest = destPoint(origin, bearing, distMi);
    if (isOnLand(dest.lat, dest.lon)) {
      return { kind: 'rotated', bearing, dest, rotationDeg: rot };
    }
  }

  // Nearest shelter that still sits within the away arc.
  const shelter = (shelters ?? [])
    .filter(
      (s) => angleDiff(bearingTo(origin, { lat: s.lat, lon: s.lon }), escapeBearing) <= arcDeg,
    )
    .sort((a, b) => a.distance_mi - b.distance_mi)[0];
  if (shelter) {
    const dest = { lat: shelter.lat, lon: shelter.lon };
    return { kind: 'shelter', bearing: bearingTo(origin, dest), dest, shelter };
  }

  // Nowhere to send them, so hand back a heading and nothing else.
  return { kind: 'direction', bearing: escapeBearing };
}

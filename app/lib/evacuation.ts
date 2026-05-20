import type { FireFeature, LatLon, Shelter } from './types';
import { bearingDeg, compassBearing, distanceMiles, nearestFire, pointAt } from './geo';

const EVAC_DISTANCE_MI = 50;

export type EvacuationPlan = {
  origin: LatLon;
  destination: LatLon;
  /** Bearing the user should head (away from the fire). 0=N clockwise. */
  awayBearingDeg: number;
  /** Cardinal label for that bearing, e.g. "SW". */
  awayCardinal: string;
  /** Bearing FROM the user TO the fire (i.e. where the threat is). */
  fireBearingDeg: number;
  fireCardinal: string;
  fireDistanceMi: number;
  evacuationDistanceMi: number;
};

export type ShelterPlan = {
  origin: LatLon;
  destination: LatLon;
  shelter: Shelter;
  /** Bearing FROM the user TO the shelter, 0=N clockwise. */
  bearingDeg: number;
  cardinal: string;
  distanceMi: number;
};

/**
 * Plan a "head away from the nearest fire" evacuation target.
 *
 * Picks a destination 50 miles in the direction opposite from the nearest fire.
 * Returns null if there are no fires within 50 miles (no evacuation needed).
 *
 * This is intentionally a simple heuristic: it gives the user's native maps
 * app a target to route to. The maps app figures out actual roads. We do NOT
 * try to model real road networks, road closures, or traffic — that's what
 * Apple/Google Maps already do well.
 */
export function planEvacuation(
  origin: LatLon,
  fires: FireFeature[] | undefined,
): EvacuationPlan | null {
  if (!fires || fires.length === 0) return null;
  const near = nearestFire(origin, fires);
  if (!near || near.distance > 50) return null;

  const fireCoords: LatLon = {
    lat: near.fire.properties.lat,
    lon: near.fire.properties.lon,
  };
  const fireBearing = bearingDeg(origin, fireCoords);
  const awayBearing = (fireBearing + 180) % 360;
  const destination = pointAt(origin, EVAC_DISTANCE_MI, awayBearing);
  return {
    origin,
    destination,
    awayBearingDeg: awayBearing,
    awayCardinal: compassBearing(awayBearing),
    fireBearingDeg: fireBearing,
    fireCardinal: compassBearing(fireBearing),
    fireDistanceMi: distanceMiles(origin, fireCoords),
    evacuationDistanceMi: EVAC_DISTANCE_MI,
  };
}

/**
 * Plan a "route to the nearest known shelter" target.
 *
 * `shelters` is assumed to come from the backend already sorted by distance,
 * but we sort defensively. Returns null if no shelters are available.
 *
 * Honest framing: these are *static* potential evacuation points from
 * OpenStreetMap (community centres, assembly points). Not officially activated
 * shelters during a current emergency — the UI should label them as such.
 */
export function planShelterRoute(
  origin: LatLon,
  shelters: Shelter[] | undefined,
): ShelterPlan | null {
  if (!shelters || shelters.length === 0) return null;
  const nearest = [...shelters].sort((a, b) => a.distance_mi - b.distance_mi)[0];
  const dest: LatLon = { lat: nearest.lat, lon: nearest.lon };
  const brg = bearingDeg(origin, dest);
  return {
    origin,
    destination: dest,
    shelter: nearest,
    bearingDeg: brg,
    cardinal: compassBearing(brg),
    distanceMi: distanceMiles(origin, dest),
  };
}

// Coarse on-land / over-water test for the evacuation router.
//
// The away-from-fire route targets a point 50 mi opposite the fire. Near a coast
// that point can land in open water (Google Maps can't route there), so the
// router calls isOnLand() to reject water destinations and fall back (rotate the
// bearing, route to a shelter, or show a direction only). See EvacuationCard.
//
// Data: Natural Earth 1:50m "land" (public domain — no attribution required),
// clipped to a US bounding box and simplified, bundled in landmask-data.ts.
// NOT for display: classification is fuzzy within a few km of intricate
// coastline, which is fine for a ~50 mi offshore check.
//
// REGENERATE landmask-data.ts (needs Node + npx):
//   1. curl -L -o ne_50m_land.geojson \
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
//   2. npx mapshaper ne_50m_land.geojson -clip bbox=-170,18,-66,72 \
//        -simplify 6% keep-shapes -o land_us.geojson format=geojson precision=0.001
//   3. run scripts-style converter → flat [lon,lat,...] rings (see repo history).

import { LAND_BBOX, LAND_RINGS } from './landmask-data';

/** True when (lat, lon) is on land per the bundled coarse US land polygon.
 *
 *  Even-odd ray casting across every ring (outer rings and holes together), so a
 *  point inside an inland lake counts as NOT land — which is what we want for
 *  "don't route me into water." Outside the bundled US bbox (incl. AK/HI) it
 *  returns false: we don't attempt to route abroad, and a non-US location simply
 *  degrades to the direction-only fallback. */
export function isOnLand(lat: number, lon: number): boolean {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lon < LAND_BBOX.minLon ||
    lon > LAND_BBOX.maxLon ||
    lat < LAND_BBOX.minLat ||
    lat > LAND_BBOX.maxLat
  ) {
    return false;
  }

  let inside = false;
  for (const ring of LAND_RINGS) {
    const n = ring.length; // flat [lon0,lat0,lon1,lat1,...]
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      const crosses =
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

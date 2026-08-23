// Land or water check for the evacuation router, so it never sends anyone toward
// open ocean. Natural Earth 1:50m land, public domain, clipped to the US and
// simplified into landmask-data.ts. Within a few km of a ragged coastline it guesses.

// To regenerate landmask-data.ts, fetch ne_50m_land.geojson from
// github.com/nvkelso/natural-earth-vector, then
//   npx mapshaper ne_50m_land.geojson -clip bbox=-170,18,-66,72 \
//     -simplify 6% keep-shapes -o land_us.geojson format=geojson precision=0.001
// and convert to flat [lon,lat,...] rings (the converter is in repo history).

import { LAND_BBOX, LAND_RINGS } from './landmask-data';

/** True when the point is on land. Ray casting counts crossings across every ring
 *  at once, holes included, so a point in a lake comes back false. Outside the
 *  bundled US boxes is false too, and the caller falls back to a heading. */
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
    const n = ring.length; // rings are flat, so lon, lat, lon, lat
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

import type { LatLon } from '@/lib/api';

/** Google Maps driving-directions URL from `origin` to `dest`. Shared by the
 *  Safety evacuation card and the shelter list so the link format lives in one
 *  place. */
export function gmapsDirectionsUrl(origin: LatLon, dest: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}&travelmode=driving`;
}

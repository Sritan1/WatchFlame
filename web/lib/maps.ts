import type { LatLon } from '@/lib/api';

/** Driving directions link, shared by the evacuation card and the shelter list
 *  so the URL format lives in one place. */
export function gmapsDirectionsUrl(origin: LatLon, dest: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}&travelmode=driving`;
}

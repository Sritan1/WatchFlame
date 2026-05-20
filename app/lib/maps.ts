import type { LatLon } from './types';
import { openExternalUrl } from './openUrl';

/**
 * Open a pin in Apple Maps. The https://maps.apple.com URL opens the native
 * Apple Maps app on iOS; on Android it falls back to the (limited) Apple Maps
 * web page. We standardize on Apple Maps for consistency across the app.
 */
export function openLocationInMaps(point: LatLon, label = 'Active wildfire'): void {
  const q = encodeURIComponent(label);
  void openExternalUrl(`https://maps.apple.com/?ll=${point.lat},${point.lon}&q=${q}`);
}

/**
 * Open driving directions in Apple Maps from `origin` to `destination`.
 * `dirflg=d` selects driving. Same cross-platform notes as above.
 */
export function openDirectionsInMaps(origin: LatLon, destination: LatLon): void {
  const o = `${origin.lat},${origin.lon}`;
  const d = `${destination.lat},${destination.lon}`;
  void openExternalUrl(`https://maps.apple.com/?saddr=${o}&daddr=${d}&dirflg=d`);
}

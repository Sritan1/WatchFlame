import type { DangerLevel } from '@/lib/types';

/** Distance + size heuristic for "Threat to You" — answers
 *  "how scary is this fire to me", in contrast to fire-weather risk which
 *  asks "how flammable are conditions here". Synchronous (no network) so it
 *  resolves instantly even while the fire-weather pill is still fetching.
 *  Mirrors the web's `severityOf` in
 *  `web/components/status/ClosestFiresList.tsx` so both platforms bucket
 *  the same fire to the same level. FIRMS-only detections without acres
 *  data fall through to distance-only banding (acres treated as 0). */
export function threatLevelFor(
  distMi: number | null,
  acres: number | null | undefined,
): DangerLevel | undefined {
  if (distMi == null) return undefined;
  const a = acres ?? 0;
  if (distMi < 6 || a > 1000) return 'EXTREME';
  if (distMi < 12 || a > 300) return 'HIGH';
  if (distMi < 25 || a > 50) return 'MODERATE';
  return 'LOW';
}

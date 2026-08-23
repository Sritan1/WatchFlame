import type { NamedIncident } from '@/lib/api';
import type { RiskLevel } from '@/lib/theme';

/** Work out a severity from distance and size, since the feeds don't give one.
 *  Either one alone can set the tier, so a big fire far off still rates. */
export function severityOf(f: NamedIncident): RiskLevel {
  const d = f.distance_mi;
  const a = f.acres ?? 0;
  if (d < 6 || a > 1000) return 'extreme';
  if (d < 12 || a > 300) return 'high';
  if (d < 25 || a > 50) return 'moderate';
  return 'low';
}

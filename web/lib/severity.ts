import type { NamedIncident } from '@/lib/api';
import type { RiskLevel } from '@/lib/theme';

/** Synthesize a severity bucket from distance + size — the backend doesn't
 *  attach one. Distance dominates: nearby = scarier. Acres adds tiebreaker. */
export function severityOf(f: NamedIncident): RiskLevel {
  const d = f.distance_mi;
  const a = f.acres ?? 0;
  if (d < 6 || a > 1000) return 'extreme';
  if (d < 12 || a > 300) return 'high';
  if (d < 25 || a > 50) return 'moderate';
  return 'low';
}

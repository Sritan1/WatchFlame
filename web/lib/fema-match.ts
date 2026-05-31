// Shared FEMA→incident matcher used by FemaBanner (to gate the Show-on-Map
// button) and MapScreen (to auto-select on intent handoff). Centralized so
// the gating and the selection logic stay in sync — otherwise the banner
// could surface a button that the map then fails to honor, or vice versa.

import type { NamedIncident } from '@/lib/api';

/** Try to find the NIFC/CalFire incident that corresponds to a FEMA disaster
 *  title. FEMA titles are like "Canyon Fire" / "Cow Creek Fire"; NIFC/CalFire
 *  incident names are like "Canyon" / "Cow Creek" (the trailing " Fire" is
 *  almost always dropped). We try exact name match first, then substring
 *  match in either direction. Returns null when nothing plausibly matches. */
export function matchIncidentByFemaTitle(
  femaTitle: string,
  fires: NamedIncident[],
): NamedIncident | null {
  // Drop the trailing " Fire" / " Wildfire" suffix and a leading "The ".
  const needle = femaTitle
    .replace(/\s+(wild)?fires?\s*$/i, '')
    .replace(/^the\s+/i, '')
    .trim()
    .toLowerCase();
  if (!needle) return null;
  const normalized = fires.map((f) => ({
    fire: f,
    name: f.name.trim().toLowerCase(),
  }));
  const exact = normalized.find((n) => n.name === needle);
  if (exact) return exact.fire;
  const contains = normalized.find(
    (n) => n.name.includes(needle) || needle.includes(n.name),
  );
  return contains ? contains.fire : null;
}

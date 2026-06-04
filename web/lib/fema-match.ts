// Shared FEMA→incident matcher used by FemaBanner (to gate the Show-on-Map
// button) and MapScreen (to auto-select on intent handoff). Centralized so
// the gating and the selection logic stay in sync — otherwise the banner
// could surface a button that the map then fails to honor, or vice versa.

import type { NamedIncident } from '@/lib/api';

/** Minimum length for a name to participate in substring matching. Short
 *  tokens ("Cow", "The", "Oak") are too generic and produced false matches
 *  under the old raw `includes` check. */
const MIN_MATCH_LEN = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word containment: does `needle` appear in `haystack` on word
 *  boundaries? "creek" matches "cow creek" but NOT "creekside" — the old
 *  `String.includes` matched the latter too. */
function wordContains(haystack: string, needle: string): boolean {
  if (needle.length < MIN_MATCH_LEN) return false;
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(haystack);
}

/** Try to find the NIFC/CalFire incident that corresponds to a FEMA disaster
 *  title. FEMA titles are like "Canyon Fire" / "Cow Creek Fire"; NIFC/CalFire
 *  incident names are like "Canyon" / "Cow Creek" (the trailing " Fire" is
 *  almost always dropped). We try exact name match first, then whole-word
 *  containment in either direction. Returns null when nothing plausibly
 *  matches.
 *
 *  When multiple incidents match (e.g. both "Creek" and "Cow Creek" exist for
 *  a "Cow Creek Fire" title), the LONGEST incident name wins — it's the most
 *  specific. The previous implementation used raw `includes` + `.find`, which
 *  (a) matched substrings inside larger words and (b) returned whichever
 *  candidate happened to be first in the array, so a short coincidental name
 *  like "Creek" could shadow the correct "Cow Creek". */
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

  let best: { fire: NamedIncident; len: number } | null = null;
  for (const n of normalized) {
    if (!n.name) continue;
    const matches = wordContains(needle, n.name) || wordContains(n.name, needle);
    if (matches && (!best || n.name.length > best.len)) {
      best = { fire: n.fire, len: n.name.length };
    }
  }
  return best ? best.fire : null;
}

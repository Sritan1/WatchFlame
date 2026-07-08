// Shared FEMA→incident matcher used by FemaBanner (to gate the Show-on-Map
// button) and MapScreen (to auto-select on intent handoff). Centralized so
// the gating and the selection logic stay in sync — otherwise the banner
// could surface a button that the map then fails to honor, or vice versa.

import type { NamedIncident } from '@/lib/api';

// Tokens shorter than this are too generic to anchor a match on their own.
const MIN_TOKEN_LEN = 3;

// Words that carry no identifying signal for a fire name.
const STOPWORDS = new Set([
  'fire',
  'fires',
  'wildfire',
  'wildfires',
  'complex',
  'the',
  'of',
  'and',
]);

/** Split a name into lowercased identifying tokens (drops the "Fire"/"Complex"
 *  style noise words and very short words). "Cow Creek Fire" -> ["cow", "creek"]. */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t));
}

/** Try to find the NIFC/CalFire incident that corresponds to a FEMA disaster
 *  title. FEMA titles are like "Canyon Fire" / "Cow Creek Fire"; NIFC/CalFire
 *  incident names are like "Canyon" / "Cow Creek" (the trailing " Fire" is
 *  almost always dropped). We try an exact name match first, then score
 *  candidates by how much of the title's identifying tokens they share.
 *  Returns null when nothing plausibly matches.
 *
 *  Ranking is by shared-token count, then FEWEST extra tokens, then shorter
 *  name. The fewest-extra tie-break is the fix for the old longest-name rule,
 *  which let a broader superset shadow the real fire (e.g. "Canyon Fire" would
 *  land on "Grand Canyon Complex" instead of "Canyon"). A candidate must cover
 *  at least half of the title's tokens to match at all, so one common word
 *  can't carry an otherwise-unrelated incident. */
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

  const normalized = fires.map((f) => ({ fire: f, name: f.name.trim().toLowerCase() }));

  // Exact name match wins outright (the common, clean case).
  const exact = normalized.find((n) => n.name && n.name === needle);
  if (exact) return exact.fire;

  const needleSet = new Set(tokenize(needle));
  if (needleSet.size === 0) return null;

  let best:
    | { fire: NamedIncident; shared: number; extra: number; len: number }
    | null = null;
  for (const n of normalized) {
    if (!n.name) continue;
    const candSet = new Set(tokenize(n.name));
    if (candSet.size === 0) continue;

    let shared = 0;
    for (const t of needleSet) if (candSet.has(t)) shared++;
    // Require the candidate to cover at least half of the title's tokens.
    if (shared === 0 || shared / needleSet.size < 0.5) continue;

    const extra = candSet.size - shared;
    const better =
      best == null ||
      shared > best.shared ||
      (shared === best.shared && extra < best.extra) ||
      (shared === best.shared && extra === best.extra && n.name.length < best.len);
    if (better) best = { fire: n.fire, shared, extra, len: n.name.length };
  }

  return best ? best.fire : null;
}

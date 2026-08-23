// Matches a FEMA disaster to one of our incidents. FemaBanner decides whether to
// show its Show-on-Map button, MapScreen picks the fire when pressed. Shared, so
// the banner can't offer a button the map then fails to honor.

import type { NamedIncident } from '@/lib/api';

// Anything shorter than this is too generic to match on.
const MIN_TOKEN_LEN = 3;

// Words that say nothing about which fire this is.
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

/** "Cow Creek Fire" becomes ["cow", "creek"]. */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t));
}

/** Find the incident behind a FEMA disaster title, or null when nothing fits. Exact
 *  match first, then shared-word scoring. Most shared wins, then fewest extra, then
 *  shorter. Fewest extras stopped "Canyon Fire" landing on "Grand Canyon Complex". */
export function matchIncidentByFemaTitle(
  femaTitle: string,
  fires: NamedIncident[],
): NamedIncident | null {
  // Strip a trailing "Fire" or "Wildfire" and a leading "The".
  const needle = femaTitle
    .replace(/\s+(wild)?fires?\s*$/i, '')
    .replace(/^the\s+/i, '')
    .trim()
    .toLowerCase();
  if (!needle) return null;

  const normalized = fires.map((f) => ({ fire: f, name: f.name.trim().toLowerCase() }));

  // An exact match wins outright, which is the usual clean case.
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
    // Has to cover half the title's words to count at all.
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

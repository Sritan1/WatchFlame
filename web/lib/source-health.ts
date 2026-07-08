'use client';

// Live per-source health, fed by the `X-Source-Health` response header that
// the backend attaches to routes which degrade gracefully (see
// api/core/source_health.py). The api client reports each response's header
// into this small external store; screens read it through useSourceHealth()
// and show a "this feed is down" note instead of a misleading empty result.
//
// The store starts empty (everything assumed ok) and only fills in after a
// real backend response arrives. The mock api never sets the header, so the
// mock-driven dev build shows no false "down" notes.
//
// Dev-only override: setSourceHealthOverrides() (driven by a `?health=` URL
// param in development) forces sources "down" so every indicator can be seen
// without breaking a real upstream. Overrides win over real reports and are
// stripped from production builds.

import { useSyncExternalStore } from 'react';

export type SourceStatus = 'ok' | 'down';
export type SourceHealth = Record<string, SourceStatus>;

// Real per-request reports from the header, each tagged with the time it
// arrived so a stale `down` can age out (see FRESH_MS).
type Entry = { status: SourceStatus; ts: number };
let realState: Record<string, Entry> = {};
// Dev overrides (win over realState). Always {} in production — the setter is a
// no-op there (see setSourceHealthOverrides), so this stays empty.
let overrides: SourceHealth = {};
// Merged, referentially-stable snapshot handed to useSyncExternalStore.
let snapshot: SourceHealth = {};
const listeners = new Set<() => void>();

// A `down` with no fresh report within this window is treated as stale and
// dropped, so a feed that recovered — or that we stopped querying after the
// user navigated away — does not show a lingering "down" note. The
// health-reporting queries carry a `refetchInterval` (see HEALTH_REFETCH_MS in
// queries.ts) so a feed that is genuinely still down keeps re-reporting while
// its screen is focused, refreshing the timestamp before this elapses. Keep
// this above every such interval (all <= 15m) or a live down note would flicker
// off between refetches.
const FRESH_MS = 20 * 60_000;

// A single low-frequency timer prunes stale `down` entries so a note can clear
// even with no further reports or navigation. It only runs while something is
// mounted AND a `down` exists, and stops itself otherwise (no idle timer).
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function anyDown(): boolean {
  for (const k in realState) if (realState[k].status === 'down') return true;
  return false;
}

function ensurePruneTimer(): void {
  if (pruneTimer !== null || listeners.size === 0 || !anyDown()) return;
  pruneTimer = setInterval(pruneStaleDowns, 60_000);
}

function stopPruneTimer(): void {
  if (pruneTimer === null) return;
  clearInterval(pruneTimer);
  pruneTimer = null;
}

function pruneStaleDowns(): void {
  const now = Date.now();
  const next: Record<string, Entry> = {};
  let removed = false;
  for (const k of Object.keys(realState)) {
    const e = realState[k];
    if (e.status === 'down' && now - e.ts > FRESH_MS) {
      removed = true;
      continue;
    }
    next[k] = e;
  }
  if (removed) {
    realState = next;
    rebuild();
  }
  if (listeners.size === 0 || !anyDown()) stopPruneTimer();
}

function merged(): SourceHealth {
  const out: SourceHealth = {};
  for (const k in realState) out[k] = realState[k].status;
  return { ...out, ...overrides };
}

function rebuild(): void {
  const next = merged();
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(next)]);
  let changed = false;
  for (const k of keys) {
    if (snapshot[k] !== next[k]) {
      changed = true;
      break;
    }
  }
  if (changed) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
}

/** Merge a per-request {source: status} map (from the header) into the store. */
export function reportSourceHealth(partial: SourceHealth): void {
  const now = Date.now();
  let touched = false;
  for (const k of Object.keys(partial)) {
    const v = partial[k];
    if (v !== 'ok' && v !== 'down') continue;
    const prev = realState[k];
    if (!prev || prev.status !== v) touched = true;
    // Always refresh the timestamp so a still-down feed keeps its note alive.
    realState = { ...realState, [k]: { status: v, ts: now } };
  }
  if (touched) rebuild();
  ensurePruneTimer(); // (re)arm if a `down` is now present
}

/** Dev-only: force a set of sources "down" (or "ok"). Replaces any prior
 *  overrides. These win over real header reports so a forced state survives
 *  the next refetch. No-op in production: NODE_ENV is statically inlined, so
 *  the body below is dead-code-eliminated from prod builds, keeping the
 *  "overrides always {} in production" invariant literally true. */
export function setSourceHealthOverrides(map: SourceHealth): void {
  if (process.env.NODE_ENV === 'production') return;
  overrides = { ...map };
  rebuild();
}

/** Parse a `?health=firms,nifc:down,calfire:ok` value into a health map.
 *  A bare key defaults to "down" (the case worth testing). */
export function parseHealthParam(value: string): SourceHealth {
  const out: SourceHealth = {};
  for (const part of value.split(',')) {
    const [rawKey, rawStatus] = part.split(':');
    const key = rawKey?.trim();
    if (!key) continue;
    out[key] = rawStatus?.trim() === 'ok' ? 'ok' : 'down';
  }
  return out;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensurePruneTimer();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) stopPruneTimer();
  };
}

function getSnapshot(): SourceHealth {
  return snapshot;
}

/** Live per-source health map. Empty until the first real backend response. */
export function useSourceHealth(): SourceHealth {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const isDown = (h: SourceHealth, k: string): boolean => h[k] === 'down';

// ─── On-screen notes (copy lives here so it stays consistent everywhere) ─────

/** Map satellite-detections note (NASA FIRMS). */
export function firmsNote(h: SourceHealth): string | null {
  return isDown(h, 'firms') ? 'Satellite feed down, fire detections unavailable' : null;
}

/** Map named-incidents note (NIFC + Cal Fire). Names the down feed and says
 *  which one is still showing. */
export function incidentFeedNote(h: SourceHealth): string | null {
  const nifc = isDown(h, 'nifc');
  const cal = isDown(h, 'calfire');
  if (nifc && cal) return 'Incident feeds down, no named incidents right now';
  if (cal) return 'Cal Fire down, only showing NIFC incidents';
  if (nifc) return 'NIFC down, only showing Cal Fire incidents';
  return null;
}

/** Safety FEMA-status note. A Census outage means the county can't be
 *  resolved, so FEMA can't be checked either. */
export function femaNote(h: SourceHealth): string | null {
  if (isDown(h, 'census')) return "Couldn't confirm your county, FEMA status unavailable";
  if (isDown(h, 'fema')) return 'FEMA status unavailable';
  return null;
}

/** Safety shelter-sources note. Names the down source(s) and reassures the
 *  rest are still listed. */
export function shelterFeedNote(h: SourceHealth): string | null {
  const names: Record<string, string> = {
    shelters_open: 'Open shelter status',
    shelters_osm: 'Mapped shelters',
    shelters_nces: 'School shelters',
  };
  const keys = ['shelters_open', 'shelters_osm', 'shelters_nces'];
  const down = keys.filter((k) => isDown(h, k));
  if (down.length === 0) return null;
  if (down.length === keys.length) return 'Shelter sources down, locations unavailable';
  const label = down.map((k) => names[k]).join(' and ');
  return `${label} down, still showing other sources`;
}

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

// Real per-request reports from the header.
let realState: SourceHealth = {};
// Dev overrides (win over realState). Always {} in production.
let overrides: SourceHealth = {};
// Merged, referentially-stable snapshot handed to useSyncExternalStore.
let snapshot: SourceHealth = {};
const listeners = new Set<() => void>();

function rebuild(): void {
  const next: SourceHealth = { ...realState, ...overrides };
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
  let touched = false;
  for (const k of Object.keys(partial)) {
    const v = partial[k];
    if (v !== 'ok' && v !== 'down') continue;
    if (realState[k] !== v) {
      realState = { ...realState, [k]: v };
      touched = true;
    }
  }
  if (touched) rebuild();
}

/** Dev-only: force a set of sources "down" (or "ok"). Replaces any prior
 *  overrides. These win over real header reports so a forced state survives
 *  the next refetch. */
export function setSourceHealthOverrides(map: SourceHealth): void {
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
  return () => {
    listeners.delete(l);
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

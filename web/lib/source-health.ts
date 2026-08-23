'use client';

// Which upstream feeds are up, read off the X-Source-Health header. Screens use
// useSourceHealth() to show a "feed is down" note instead of a misleading empty
// result. Starts empty, so everything is fine until a response says otherwise.

import { useSyncExternalStore } from 'react';

export type SourceStatus = 'ok' | 'down';
export type SourceHealth = Record<string, SourceStatus>;

// Each report is stamped with its arrival time so an old down can age out.
type Entry = { status: SourceStatus; ts: number };
let realState: Record<string, Entry> = {};
// Kept stable by reference for useSyncExternalStore.
let snapshot: SourceHealth = {};
const listeners = new Set<() => void>();

// An unconfirmed down this old gets dropped, so a recovered feed doesn't leave a
// note hanging. Keep this above every reporting refetchInterval or the note
// flickers between refetches.
const FRESH_MS = 20 * 60_000;

// One slow timer clears stale down entries so a note can go away with no further
// reports. Runs only while something is mounted and down, and stops itself.
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
  return out;
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

/** Fold one response's {source: status} map into the store. */
export function reportSourceHealth(partial: SourceHealth): void {
  const now = Date.now();
  let touched = false;
  for (const k of Object.keys(partial)) {
    const v = partial[k];
    if (v !== 'ok' && v !== 'down') continue;
    const prev = realState[k];
    if (!prev || prev.status !== v) touched = true;
    // Refresh the timestamp either way, so a still-down feed keeps its note.
    realState = { ...realState, [k]: { status: v, ts: now } };
  }
  if (touched) rebuild();
  ensurePruneTimer(); // arm it if something just went down
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

/** The current health map, empty until a real backend response lands. */
export function useSourceHealth(): SourceHealth {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const isDown = (h: SourceHealth, k: string): boolean => h[k] === 'down';

// On-screen notes, kept together so the wording stays consistent.

/** Note for the satellite detections on the map. */
export function firmsNote(h: SourceHealth): string | null {
  return isDown(h, 'firms') ? 'Satellite feed down, fire detections unavailable' : null;
}

/** Note for the named incidents, saying which feed is out and which is left. */
export function incidentFeedNote(h: SourceHealth): string | null {
  const nifc = isDown(h, 'nifc');
  const cal = isDown(h, 'calfire');
  if (nifc && cal) return 'Incident feeds down, no named incidents right now';
  if (cal) return 'Cal Fire down, only showing NIFC incidents';
  if (nifc) return 'NIFC down, only showing Cal Fire incidents';
  return null;
}

/** Note for FEMA status on Safety. No Census means no county, and no county means
 *  nothing to look up at FEMA. */
export function femaNote(h: SourceHealth): string | null {
  if (isDown(h, 'census')) return "Couldn't confirm your county, FEMA status unavailable";
  if (isDown(h, 'fema')) return 'FEMA status unavailable';
  return null;
}

/** Note for the shelter sources, naming what's out and what still shows. */
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

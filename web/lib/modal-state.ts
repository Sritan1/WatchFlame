'use client';

// Tracks whether any modal is open, so background animation like the Status
// waves can stop while something covers the screen. <Modal> counts itself in and
// out, so no individual modal needs wiring.

import { useSyncExternalStore } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Called by <Modal> when it opens. */
export function pushModalOpen(): void {
  openCount += 1;
  emit();
}

/** Called by <Modal> when it closes/unmounts. */
export function popModalOpen(): void {
  openCount = Math.max(0, openCount - 1);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while at least one modal is open anywhere in the app. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => false, // on the server, nothing is open
  );
}

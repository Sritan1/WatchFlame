'use client';

// Tiny global "is any shared Modal open" store. Lets ambient background work
// (e.g. the Status waves canvas) pause while a modal covers the screen, without
// wiring each modal in by hand. The shared <Modal> increments on open and
// decrements on close; consumers read it via useAnyModalOpen().

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

/** True whenever at least one shared Modal is open anywhere in the app. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => false, // SSR: nothing is open
  );
}

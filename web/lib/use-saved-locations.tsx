'use client';

// The places the user has saved, kept in localStorage. A null activeId means use
// the device GPS, anything else picks that saved place. useUserLocation reads
// this to decide whether to override GPS.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface SavedLocation {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = 'ember:saved-locations';
const STORAGE_ACTIVE_KEY = 'ember:active-location';

/** Keeps the picker readable. The data is tiny, so this guards nothing else. */
export const MAX_SAVED_LOCATIONS = 10;

interface SavedLocationsState {
  items: SavedLocation[];
  /** Null means use device GPS. */
  activeId: string | null;
  setActive: (id: string | null) => void;
  /** The id of the new or already-saved location, or null when the list is full
   *  and this one is genuinely new. */
  add: (loc: Omit<SavedLocation, 'id'>) => string | null;
  remove: (id: string) => void;
}

const Ctx = createContext<SavedLocationsState | null>(null);

function newId(): string {
  return 'loc_' + Math.random().toString(36).slice(2, 10);
}

/** Check what came back out of localStorage, which could be an old key format,
 *  another tab's write, or corruption. Calling .find on a non-array would take the
 *  whole tree down, so filter first. */
function isSavedLocation(v: unknown): v is SavedLocation {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.lat === 'number' &&
    typeof o.lon === 'number'
  );
}

export function SavedLocationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedLocation[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  // Read storage after mount, or the server and client render differently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed.filter(isSavedLocation));
      }
      const active = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (active) setActiveIdState(active);
    } catch {
      // No localStorage in private mode, so just keep the defaults.
    }
  }, []);

  const persistItems = useCallback((next: SavedLocation[]) => {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* best-effort */
    }
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id == null) localStorage.removeItem(STORAGE_ACTIVE_KEY);
      else localStorage.setItem(STORAGE_ACTIVE_KEY, id);
    } catch {
      /* best-effort */
    }
  }, []);

  const add = useCallback(
    (loc: Omit<SavedLocation, 'id'>): string | null => {
      // Match on coordinates, not the label. Two different towns can share a
      // "name, state, country" label, and matching on that quietly merged them
      // and pointed the picker somewhere else.
      const existing = items.find(
        (i) => Math.abs(i.lat - loc.lat) < 1e-4 && Math.abs(i.lon - loc.lon) < 1e-4,
      );
      if (existing) return existing.id;
      // A genuinely new one past the cap returns null, so the caller can say so
      // instead of silently doing nothing. Re-saving never grows the list.
      if (items.length >= MAX_SAVED_LOCATIONS) return null;
      const id = newId();
      persistItems([...items, { ...loc, id }]);
      return id;
    },
    [items, persistItems],
  );

  const remove = useCallback(
    (id: string) => {
      persistItems(items.filter((i) => i.id !== id));
      if (activeId === id) setActive(null);
    },
    [items, activeId, persistItems, setActive],
  );

  const value = useMemo<SavedLocationsState>(
    () => ({ items, activeId, setActive, add, remove }),
    [items, activeId, setActive, add, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSavedLocations(): SavedLocationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSavedLocations must be used within <SavedLocationsProvider>');
  return ctx;
}

'use client';

// Saved-locations store. Persisted to localStorage. `activeId === null` means
// "use device GPS"; any other id selects the matching saved item.
// useUserLocation reads from this to decide whether to override GPS coords.

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

/** Cap on saved locations. Each one is a place the user actively watches (home,
 *  family, a cabin, work), so real use sits well under this. The cap keeps the
 *  picker list scannable and localStorage bounded rather than being a technical
 *  limit — the data itself is tiny. */
export const MAX_SAVED_LOCATIONS = 10;

interface SavedLocationsState {
  items: SavedLocation[];
  /** null = use device GPS. */
  activeId: string | null;
  setActive: (id: string | null) => void;
  /** Returns the id of the saved (or matched-existing) location, or null when
   *  the list is already at MAX_SAVED_LOCATIONS and this is a genuinely new one. */
  add: (loc: Omit<SavedLocation, 'id'>) => string | null;
  remove: (id: string) => void;
}

const Ctx = createContext<SavedLocationsState | null>(null);

function newId(): string {
  return 'loc_' + Math.random().toString(36).slice(2, 10);
}

/** Validate a value read back from localStorage. Storage can hold a non-array
 *  or a malformed entry (an older key format, a value written by another tab,
 *  manual/corrupted data); trusting the shape and calling .find/.filter/.map
 *  on a non-array would crash the whole tree, so we filter down to well-formed
 *  entries instead. */
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

  // Hydrate from localStorage after mount (avoids SSR mismatch).
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
      // localStorage may be unavailable (private mode) — silently keep defaults.
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
      // Dedupe on COORDINATES (~11 m), not label: re-saving the exact same
      // geocoder result reuses the existing row, but two distinct places that
      // happen to render the same "name, state, country" label (they resolve to
      // different coordinates) must stay separate — a label-only match silently
      // merged them and pointed the picker at the wrong point. Return the
      // existing id so the caller can still make it the active location.
      const existing = items.find(
        (i) => Math.abs(i.lat - loc.lat) < 1e-4 && Math.abs(i.lon - loc.lon) < 1e-4,
      );
      if (existing) return existing.id;
      // Re-saving an existing location above is always allowed (it doesn't grow
      // the list); a genuinely new one past the cap is rejected with null so the
      // caller can surface the limit instead of silently doing nothing.
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

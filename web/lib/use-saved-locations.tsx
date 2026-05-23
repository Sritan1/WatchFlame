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

interface SavedLocationsState {
  items: SavedLocation[];
  /** null = use device GPS. */
  activeId: string | null;
  setActive: (id: string | null) => void;
  add: (loc: Omit<SavedLocation, 'id'>) => string;
  remove: (id: string) => void;
}

const Ctx = createContext<SavedLocationsState | null>(null);

function newId(): string {
  return 'loc_' + Math.random().toString(36).slice(2, 10);
}

export function SavedLocationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedLocation[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as SavedLocation[]);
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
    (loc: Omit<SavedLocation, 'id'>): string => {
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

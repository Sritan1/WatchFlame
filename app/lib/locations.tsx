import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { SavedLocation } from './types';

const SAVED_KEY = 'wildfire.savedLocations.v1';
const ACTIVE_KEY = 'wildfire.activeLocationId.v1';

/** ID === 'gps' is the special "use my GPS" sentinel. */
export const GPS_LOCATION_ID = 'gps';

type Ctx = {
  items: SavedLocation[];
  activeId: string;
  active: SavedLocation | null;
  hydrated: boolean;
  add: (loc: Omit<SavedLocation, 'id'>) => string;
  remove: (id: string) => void;
  setActive: (id: string) => void;
};

const SavedLocationsContext = createContext<Ctx | null>(null);

export function SavedLocationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedLocation[]>([]);
  const [activeId, setActiveIdState] = useState<string>(GPS_LOCATION_ID);
  const [hydrated, setHydrated] = useState(false);

  // Load on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [savedRaw, activeRaw] = await Promise.all([
          AsyncStorage.getItem(SAVED_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
        ]);
        if (!alive) return;
        if (savedRaw) {
          try {
            const parsed = JSON.parse(savedRaw) as SavedLocation[];
            if (Array.isArray(parsed)) setItems(parsed);
          } catch {}
        }
        if (activeRaw) setActiveIdState(activeRaw);
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(SAVED_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(ACTIVE_KEY, activeId).catch(() => {});
  }, [activeId, hydrated]);

  const add = useCallback((loc: Omit<SavedLocation, 'id'>) => {
    const id = `${loc.lat.toFixed(3)}_${loc.lon.toFixed(3)}_${Date.now()}`;
    setItems((prev) => [...prev, { ...loc, id }]);
    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((l) => l.id !== id));
    setActiveIdState((curr) => (curr === id ? GPS_LOCATION_ID : curr));
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveIdState(id);
  }, []);

  const active = useMemo<SavedLocation | null>(() => {
    if (activeId === GPS_LOCATION_ID) return null;
    return items.find((l) => l.id === activeId) ?? null;
  }, [items, activeId]);

  const value = useMemo<Ctx>(
    () => ({ items, activeId, active, hydrated, add, remove, setActive }),
    [items, activeId, active, hydrated, add, remove, setActive],
  );

  return (
    <SavedLocationsContext.Provider value={value}>
      {children}
    </SavedLocationsContext.Provider>
  );
}

export function useSavedLocations(): Ctx {
  const ctx = useContext(SavedLocationsContext);
  if (!ctx) {
    throw new Error(
      'useSavedLocations must be used inside <SavedLocationsProvider>. ' +
        'Make sure the root layout wraps the app with it.',
    );
  }
  return ctx;
}

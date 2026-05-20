import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'wildfire.checklist.v1';

/**
 * Persistent boolean state for evacuation-checklist items.
 * Returns [checked, toggle] for the given item id.
 */
export function useChecklist(ids: string[]) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ids.map((id) => [id, false])),
  );
  const [hydrated, setHydrated] = useState(false);

  // Load on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw) {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          setState((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // ignore — fall back to default
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist on change (after hydration so we don't overwrite on first render)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const toggle = (id: string) =>
    setState((prev) => ({ ...prev, [id]: !prev[id] }));

  const reset = () => {
    const cleared = Object.fromEntries(ids.map((id) => [id, false]));
    setState(cleared);
  };

  return { state, toggle, reset, hydrated };
}

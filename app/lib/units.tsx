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

export type TempUnit = 'C' | 'F';
export type SpeedUnit = 'kph' | 'mph';
export type DistanceUnit = 'mi' | 'km';

export type UnitPreferences = {
  temp: TempUnit;
  speed: SpeedUnit;
  distance: DistanceUnit;
};

const STORAGE_KEY = 'wildfire.units.v1';
const DEFAULT_UNITS: UnitPreferences = { temp: 'C', speed: 'kph', distance: 'mi' };

type Ctx = {
  units: UnitPreferences;
  setUnits: (
    next: UnitPreferences | ((prev: UnitPreferences) => UnitPreferences),
  ) => void;
  hydrated: boolean;
};

const UnitsContext = createContext<Ctx | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<UnitPreferences>(DEFAULT_UNITS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw) {
          setUnitsState({ ...DEFAULT_UNITS, ...JSON.parse(raw) });
        }
      } catch {
        // ignore
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(units)).catch(() => {});
  }, [units, hydrated]);

  const setUnits = useCallback(
    (next: UnitPreferences | ((prev: UnitPreferences) => UnitPreferences)) => {
      setUnitsState((prev) => (typeof next === 'function' ? next(prev) : next));
    },
    [],
  );

  const value = useMemo<Ctx>(
    () => ({ units, setUnits, hydrated }),
    [units, setUnits, hydrated],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): Ctx {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    throw new Error(
      'useUnits must be used inside <UnitsProvider>. Make sure the root layout wraps the app with it.',
    );
  }
  return ctx;
}

// --- Conversions -------------------------------------------------------------

export function formatTemp(celsius: number | null | undefined, unit: TempUnit): string {
  if (celsius == null || Number.isNaN(celsius)) return '—';
  const v = unit === 'F' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(v)}°${unit}`;
}

export function formatSpeed(kph: number | null | undefined, unit: SpeedUnit): string {
  if (kph == null || Number.isNaN(kph)) return '—';
  const v = unit === 'mph' ? kph * 0.621371 : kph;
  return `${Math.round(v)} ${unit}`;
}

export function formatDistance(miles: number | null | undefined, unit: DistanceUnit): string {
  if (miles == null || Number.isNaN(miles)) return '—';
  const v = unit === 'km' ? miles * 1.60934 : miles;
  return `${Math.round(v)} ${unit}`;
}

/** Bare numeric distance (no unit suffix), useful for Status hero text. */
export function distanceValue(miles: number, unit: DistanceUnit): { value: number; suffix: string } {
  if (unit === 'km') return { value: Math.round(miles * 1.60934), suffix: 'km' };
  return { value: Math.round(miles), suffix: 'mi' };
}

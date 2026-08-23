'use client';

// Unit preferences, saved to localStorage so a refresh keeps them.

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
export type SpeedUnit = 'mph' | 'kph';
export type DistanceUnit = 'mi' | 'km';

export interface UnitPreferences {
  temp: TempUnit;
  speed: SpeedUnit;
  distance: DistanceUnit;
}

const DEFAULTS: UnitPreferences = { temp: 'C', speed: 'mph', distance: 'mi' };
const STORAGE_KEY = 'ember:units';

interface UnitsState extends UnitPreferences {
  setTemp: (u: TempUnit) => void;
  setSpeed: (u: SpeedUnit) => void;
  setDistance: (u: DistanceUnit) => void;
}

const Ctx = createContext<UnitsState | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UnitPreferences>(DEFAULTS);

  // Read storage after mount, or the server and client render differently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UnitPreferences>;
        setPrefs({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // No localStorage in private mode, so keep the defaults.
    }
  }, []);

  const persist = useCallback((next: UnitPreferences) => {
    setPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort persistence
    }
  }, []);

  const value = useMemo<UnitsState>(
    () => ({
      ...prefs,
      setTemp: (u) => persist({ ...prefs, temp: u }),
      setSpeed: (u) => persist({ ...prefs, speed: u }),
      setDistance: (u) => persist({ ...prefs, distance: u }),
    }),
    [prefs, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnits(): UnitsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUnits must be used within <UnitsProvider>');
  return ctx;
}

export function formatTemp(celsius: number, unit: TempUnit, digits = 0): string {
  const n = unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
  return `${n.toFixed(digits)}°${unit}`;
}

/** Format a wind speed. Everything on the client holds wind in km/h, since that is
 *  what the backend sends, so pass km/h in and this converts only if asked. */
export function formatSpeed(kph: number, unit: SpeedUnit, digits = 0): string {
  const n = unit === 'mph' ? kph * 0.621371 : kph;
  return `${n.toFixed(digits)} ${unit}`;
}

/** Miles into the user's unit, as a bare number, for when the label is styled
 *  separately. Otherwise use formatDistance. */
export function convertDistance(miles: number, unit: DistanceUnit): number {
  return unit === 'km' ? miles * 1.60934 : miles;
}

export function formatDistance(miles: number, unit: DistanceUnit, digits = 1): string {
  return `${convertDistance(miles, unit).toFixed(digits)} ${unit}`;
}

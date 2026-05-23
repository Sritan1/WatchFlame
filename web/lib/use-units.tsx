'use client';

// User unit preferences. Persisted to localStorage so a refresh keeps choices.
// Defaults: °C / mph / mi (US-with-metric — matches the reference scenario).

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

  // Hydrate from localStorage after mount (avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UnitPreferences>;
        setPrefs({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // localStorage might be unavailable (private mode etc) — silently keep defaults.
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

// ─── Conversion helpers (pure functions) ────────────────────────────────────

export function formatTemp(celsius: number, unit: TempUnit, digits = 0): string {
  const n = unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
  return `${n.toFixed(digits)}°${unit}`;
}

/** Format a wind speed for display. The backend always returns wind_speed in
 *  km/h (api/services/owm.py converts OWM's m/s → kph, Open-Meteo asks for
 *  kph, and /risk's wind_speed field is documented as km/h). So the canonical
 *  internal unit on the client is kph; this helper converts to mph for the
 *  user if their preference is mph. Matches app/lib/units.tsx. */
export function formatSpeed(kph: number, unit: SpeedUnit, digits = 0): string {
  const n = unit === 'mph' ? kph * 0.621371 : kph;
  return `${n.toFixed(digits)} ${unit}`;
}

export function formatDistance(miles: number, unit: DistanceUnit, digits = 1): string {
  const n = unit === 'km' ? miles * 1.60934 : miles;
  return `${n.toFixed(digits)} ${unit}`;
}

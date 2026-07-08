'use client';

// Client-side context for the active aesthetic + risk accent.
// Defaults to "gov" + "orange" (matches the reference designs). The chosen
// aesthetic is persisted to localStorage — like units and saved locations —
// so a refresh keeps it (Settings tells the user "preferences are saved to
// this browser").

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from 'react';

import {
  AESTHETICS,
  type Aesthetic,
  type AestheticId,
  type AccentHue,
} from './theme';

const STORAGE_KEY = 'ember:aesthetic';

// The risk accent is a single fixed hue today (no UI toggles it). Kept as a
// named constant so theme.getRisk still receives it explicitly.
const ACCENT: AccentHue = 'orange';

interface AestheticState {
  ae: Aesthetic;
  aestheticId: AestheticId;
  setAestheticId: (id: AestheticId) => void;
  accent: AccentHue;
}

const AestheticContext = createContext<AestheticState | null>(null);

function isAestheticId(v: unknown): v is AestheticId {
  return typeof v === 'string' && v in AESTHETICS;
}

export function AestheticProvider({ children }: { children: ReactNode }) {
  const [aestheticId, setAestheticIdState] = useState<AestheticId>('gov');

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isAestheticId(raw)) setAestheticIdState(raw);
    } catch {
      // localStorage may be unavailable (private mode) — keep the default.
    }
  }, []);

  const setAestheticId = useCallback((id: AestheticId) => {
    setAestheticIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // best-effort persistence
    }
  }, []);

  const value = useMemo<AestheticState>(
    () => ({
      ae: AESTHETICS[aestheticId],
      aestheticId,
      setAestheticId,
      accent: ACCENT,
    }),
    [aestheticId, setAestheticId],
  );

  return <AestheticContext.Provider value={value}>{children}</AestheticContext.Provider>;
}

export function useAesthetic(): AestheticState {
  const ctx = useContext(AestheticContext);
  if (!ctx) throw new Error('useAesthetic must be used within <AestheticProvider>');
  return ctx;
}

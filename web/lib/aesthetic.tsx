'use client';

// Which look the app is wearing, plus the risk accent. Saved to localStorage,
// since Settings promises preferences stick.

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

// Nothing in the UI changes the accent, but getRisk still takes one, so name it.
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

  // Read storage after mount, or the server and client render differently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isAestheticId(raw)) setAestheticIdState(raw);
    } catch {
      // No localStorage in private mode, so keep the default.
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

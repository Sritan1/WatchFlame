'use client';

// Client-side context for the active aesthetic + risk accent.
// Defaults to "gov" + "orange" (matches the reference designs).

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

import {
  AESTHETICS,
  type Aesthetic,
  type AestheticId,
  type AccentHue,
} from './theme';

interface AestheticState {
  ae: Aesthetic;
  aestheticId: AestheticId;
  setAestheticId: (id: AestheticId) => void;
  accent: AccentHue;
  setAccent: (hue: AccentHue) => void;
}

const AestheticContext = createContext<AestheticState | null>(null);

export function AestheticProvider({ children }: { children: ReactNode }) {
  const [aestheticId, setAestheticId] = useState<AestheticId>('gov');
  const [accent, setAccent] = useState<AccentHue>('orange');

  const value = useMemo<AestheticState>(
    () => ({
      ae: AESTHETICS[aestheticId],
      aestheticId,
      setAestheticId,
      accent,
      setAccent,
    }),
    [aestheticId, accent],
  );

  return <AestheticContext.Provider value={value}>{children}</AestheticContext.Provider>;
}

export function useAesthetic(): AestheticState {
  const ctx = useContext(AestheticContext);
  if (!ctx) throw new Error('useAesthetic must be used within <AestheticProvider>');
  return ctx;
}

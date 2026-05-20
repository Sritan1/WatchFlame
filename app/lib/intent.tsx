/**
 * Reactive cross-screen intent flags via Context.
 *
 * Why a Context (not a module-level variable): module flags don't trigger
 * React re-renders, so a screen that mounts AFTER the flag is set may miss it.
 * Wrapping the flag in a useState-backed Context makes it reactive: any
 * subscriber re-renders when the flag flips, and useEffects depending on it
 * fire reliably no matter what order things mount or resolve in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type IntentValue = {
  /** True when another screen has asked the Map to auto-select the closest fire. */
  pendingShowOnMap: boolean;
  /** Set the flag (call from any screen, e.g. the FEMA banner). */
  requestShowOnMap: () => void;
  /** Clear the flag (call from the Map screen after it has acted on it). */
  consumeShowOnMap: () => void;
};

const IntentContext = createContext<IntentValue | null>(null);

export function IntentProvider({ children }: { children: ReactNode }) {
  const [pendingShowOnMap, setPending] = useState(false);

  const requestShowOnMap = useCallback(() => setPending(true), []);
  const consumeShowOnMap = useCallback(() => setPending(false), []);

  const value = useMemo<IntentValue>(
    () => ({ pendingShowOnMap, requestShowOnMap, consumeShowOnMap }),
    [pendingShowOnMap, requestShowOnMap, consumeShowOnMap],
  );

  return <IntentContext.Provider value={value}>{children}</IntentContext.Provider>;
}

export function useIntent(): IntentValue {
  const ctx = useContext(IntentContext);
  if (!ctx) {
    throw new Error('useIntent must be used inside <IntentProvider>');
  }
  return ctx;
}

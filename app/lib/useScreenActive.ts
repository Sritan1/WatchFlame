import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Returns true only when the current screen is focused AND the app is in the
 * foreground. Use to gate continuous animation loops so they stop costing
 * battery/heat when the user has navigated away or backgrounded the app.
 *
 * Used by WavesBackground, HeroOrb, and ShimmerPill on the Status screen.
 */
export function useScreenActive(): boolean {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
    });
    return () => sub.remove();
  }, []);

  return focused && appActive;
}

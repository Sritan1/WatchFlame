import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';

import { MOTION, TABULAR } from '@/lib/theme';

type Props = Omit<TextProps, 'children'> & {
  /** The target value. The component animates from its current display to this. */
  value: number;
  /** Formatter. Defaults to whole-integer rounding. */
  format?: (n: number) => string;
  /** Animation duration in ms. Defaults to MOTION.slow (~1.1s). */
  duration?: number;
};

/**
 * Smoothly counts a number from its previous value to a new one. Uses a
 * cubic ease-out curve (1 - (1 - t)^3.2) so the value lands decisively rather
 * than gliding to a stop.
 *
 * Renders as a normal RN <Text>, with tabular-nums applied so digits don't
 * shift width as they tick. All Text props pass through (className, style, …).
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(0),
  duration = MOTION.slow,
  style,
  ...rest
}: Props) {
  const [display, setDisplay] = useState(value);
  // Last value we animated TOWARD. Used to skip the no-op effect on mount.
  const lastTargetRef = useRef(value);

  useEffect(() => {
    if (value === lastTargetRef.current) return;
    lastTargetRef.current = value;

    const from = display;
    const to = value;
    const start = Date.now();
    let raf: number | null = null;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3.2);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
    // Intentionally exclude `display` so a mid-animation value change picks up
    // from wherever the count currently is, without restarting from zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <Text style={[TABULAR, style]} {...rest}>
      {format(display)}
    </Text>
  );
}

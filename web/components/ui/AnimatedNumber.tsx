'use client';

// Smoothly counts to `value` over `duration` ms, then jumps to the new value
// when `value` changes. Uses the reference's cubic-out easing (1 - (1-t)^3.2)
// for a settling feel — fast at the start, gentle at the end.

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function AnimatedNumber({
  value,
  duration = 1100,
  startFrom = 0,
  format = (n) => Math.round(n).toString(),
  style,
}: {
  value: number;
  duration?: number;
  startFrom?: number;
  format?: (n: number) => string;
  style?: CSSProperties;
}) {
  const [n, setN] = useState(startFrom);
  // The value currently on screen. Starting a new tween from this (rather than
  // the last fully-completed value) means an interrupted tween continues from
  // where it visibly is instead of snapping backward and re-animating.
  const currentRef = useRef(startFrom);

  useEffect(() => {
    // Honor prefers-reduced-motion: jump straight to the target, no count-up.
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    if (reduce) {
      currentRef.current = value;
      raf = requestAnimationFrame(() => setN(value));
      return () => cancelAnimationFrame(raf);
    }

    const from = currentRef.current;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3.2);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const cur = from + (value - from) * ease(t);
      currentRef.current = cur;
      setN(cur);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span style={style}>{format(n)}</span>;
}

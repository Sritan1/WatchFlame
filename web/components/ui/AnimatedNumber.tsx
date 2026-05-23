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
  const fromRef = useRef(startFrom);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3.2);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const cur = from + (value - from) * ease(t);
      setN(cur);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span style={style}>{format(n)}</span>;
}

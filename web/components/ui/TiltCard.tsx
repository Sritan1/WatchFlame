'use client';

// Subtle 3D card tilt that follows the cursor. Exposes --mx/--my CSS vars
// (0..100%) — the .tilt-card.with-shine rules in globals.css use these to
// render a moving highlight that gives cards real depth.

import { useRef, type CSSProperties, type ReactNode } from 'react';

export function TiltCard({
  children,
  max = 5,
  scale = 1.012,
  style,
  glow = true,
  onClick,
}: {
  children: ReactNode;
  /** Max tilt in degrees on each axis (default 5°). */
  max?: number;
  /** Hover scale factor (default 1.012). */
  scale?: number;
  style?: CSSProperties;
  /** When true, the radial shine + border highlight render on hover. */
  glow?: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const rx = (0.5 - y) * max * 2;
    const ry = (x - 0.5) * max * 2;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--tilt-x', `${rx}deg`);
    el.style.setProperty('--tilt-y', `${ry}deg`);
    el.style.setProperty('--tilt-scale', String(scale));
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
    el.style.setProperty('--tilt-scale', '1');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={glow ? 'tilt-card with-shine' : 'tilt-card'}
      style={{
        transformStyle: 'preserve-3d',
        transform:
          'perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) scale(var(--tilt-scale, 1))',
        transition: 'transform 0.45s cubic-bezier(0.2, 0.7, 0.3, 1)',
        position: 'relative',
        willChange: 'transform',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

'use client';

// Subtle cursor-following translation — used inside HeroOrb so the orb drifts
// a few pixels toward the cursor, giving the parallax depth of a real instrument.

import { useRef, type CSSProperties, type ReactNode } from 'react';

export function CursorParallax({
  children,
  strength = 12,
  style,
}: {
  children: ReactNode;
  strength?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / r.width;
    const y = (e.clientY - r.top - r.height / 2) / r.height;
    el.style.setProperty('--px', `${x * strength}px`);
    el.style.setProperty('--py', `${y * strength}px`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--px', '0px');
    el.style.setProperty('--py', '0px');
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        transform: 'translate3d(var(--px, 0px), var(--py, 0px), 0)',
        transition: 'transform 0.6s cubic-bezier(0.2, 0.7, 0.3, 1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

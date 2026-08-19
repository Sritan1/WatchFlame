'use client';

// Plain card wrapper. Previously a 3D cursor-follow tilt (scale + moving shine);
// that hover animation was removed so Status cards render flat. Kept as a wrapper
// so every call site — and its onClick/styling — stays unchanged.

import { type CSSProperties, type ReactNode } from 'react';

export function TiltCard({
  children,
  style,
  onClick,
}: {
  children: ReactNode;
  /** Retained for call-site compatibility; no longer used. */
  max?: number;
  /** Retained for call-site compatibility; no longer used. */
  scale?: number;
  /** Retained for call-site compatibility; no longer used. */
  glow?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

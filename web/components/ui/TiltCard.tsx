'use client';

// Plain card wrapper. This used to tilt and shine under the cursor, and the
// animation was dropped so Status cards render flat. Kept as a wrapper so every
// call site stays unchanged.

import { type CSSProperties, type ReactNode } from 'react';

export function TiltCard({
  children,
  style,
  onClick,
}: {
  children: ReactNode;
  /** Kept for call-site compatibility, no longer used. */
  max?: number;
  /** Kept for call-site compatibility, no longer used. */
  scale?: number;
  /** Kept for call-site compatibility, no longer used. */
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

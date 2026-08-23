'use client';

// Plain wrapper. This used to drift with the cursor behind HeroOrb, and the
// animation was dropped. Kept as a passthrough so HeroOrb is unchanged.

import { type CSSProperties, type ReactNode } from 'react';

export function CursorParallax({
  children,
  style,
}: {
  children: ReactNode;
  /** Kept for call-site compatibility, no longer used. */
  strength?: number;
  style?: CSSProperties;
}) {
  return <div style={style}>{children}</div>;
}

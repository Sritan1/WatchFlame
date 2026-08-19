'use client';

// Plain wrapper. Previously a cursor-following parallax drift used by HeroOrb;
// that hover animation was removed. Kept as a passthrough so HeroOrb is unchanged.

import { type CSSProperties, type ReactNode } from 'react';

export function CursorParallax({
  children,
  style,
}: {
  children: ReactNode;
  /** Retained for call-site compatibility; no longer used. */
  strength?: number;
  style?: CSSProperties;
}) {
  return <div style={style}>{children}</div>;
}

'use client';

import { useId } from 'react';

/** Diagonal stripe SVG overlay — used inside the FEMA card for that
 *  federal/official feel. Render as the first child of a positioned card. */
export function StripePattern({
  color,
  opacity = 0.05,
}: {
  color: string;
  opacity?: number;
}) {
  // Unique per instance so repeated stripes don't collide on a shared id, and
  // so the id never embeds a raw "#hex" color (fragile inside a url(#…) ref).
  const id = `stripe-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
      }}
    >
      <defs>
        <pattern
          id={id}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke={color} strokeWidth="1" opacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

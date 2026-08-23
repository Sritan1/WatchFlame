'use client';

import { useId } from 'react';

/** Faint grid overlay, giving featured cards a measured, technical texture. */
export function GridPattern({
  opacity = 0.04,
  color = '#fff',
}: {
  opacity?: number;
  color?: string;
}) {
  // Per-instance, because many of these mount on one page at different opacities and
  // a shared id resolves document-wide to the first. Strip the colons useId emits,
  // they're invalid inside a url() reference.
  const id = `grid-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
    >
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M 14 0 L 0 0 0 14" fill="none" stroke={color} strokeWidth="0.5" opacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

'use client';

import { useId } from 'react';

/** Faint grid pattern overlay — for "technical/measured" feel on featured
 *  cards (active-incident dashboard, score panels). */
export function GridPattern({
  opacity = 0.04,
  color = '#fff',
}: {
  opacity?: number;
  color?: string;
}) {
  // Unique per instance: many GridPatterns mount on one page with different
  // opacities, and a shared id would make every url(#…) resolve to the first
  // one document-wide. Strip the colons useId() emits so the id is safe inside
  // a url(#…) reference.
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

/** Faint grid pattern overlay — for "technical/measured" feel on featured
 *  cards (active-incident dashboard, score panels). */
export function GridPattern({
  opacity = 0.04,
  color = '#fff',
}: {
  opacity?: number;
  color?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
    >
      <defs>
        <pattern id="grid-p" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M 14 0 L 0 0 0 14" fill="none" stroke={color} strokeWidth="0.5" opacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-p)" />
    </svg>
  );
}

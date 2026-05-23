/** Diagonal stripe SVG overlay — used inside the FEMA card for that
 *  federal/official feel. Render as the first child of a positioned card. */
export function StripePattern({
  color,
  opacity = 0.05,
}: {
  color: string;
  opacity?: number;
}) {
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
          id={`stripe-${color}`}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke={color} strokeWidth="1" opacity={opacity} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#stripe-${color})`} />
    </svg>
  );
}

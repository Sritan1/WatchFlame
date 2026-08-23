'use client';

import { useAesthetic } from '@/lib/aesthetic';

/** Tiny uppercase mono label. Pair with big numbers, headlines, or stat tiles. */
export function Eyebrow({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        color: color ?? ae.textMute,
        // Wider tracking looks more confident. Changing it here cascades to every
        // screen that uses this component.
        letterSpacing: '0.16em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

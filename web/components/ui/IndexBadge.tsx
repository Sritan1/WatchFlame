'use client';

// Tiny mono numeric label (e.g. "01", "02") — used for ordering input panels
// and checklist items. Two digits zero-padded.

import { useAesthetic } from '@/lib/aesthetic';

export function IndexBadge({ n, color }: { n: number; color?: string }) {
  const { ae } = useAesthetic();
  return (
    <span
      style={{
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: color ?? ae.textMute,
        fontVariantNumeric: 'tabular-nums',
        minWidth: 22,
        textAlign: 'right',
      }}
    >
      {String(n).padStart(2, '0')}
    </span>
  );
}

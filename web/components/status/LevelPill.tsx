'use client';

// The small gradient pill on the KBDI and NDVI cards, shared by both so their
// chrome stays in lockstep.

import type { useAesthetic } from '@/lib/aesthetic';

export function LevelPill({
  ae,
  color,
  glow,
  label,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  color: string;
  glow: string;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 9px',
        borderRadius: 99,
        background: `linear-gradient(180deg, rgba(${glow}, 0.18), rgba(${glow}, 0.06))`,
        border: `0.5px solid rgba(${glow}, 0.32)`,
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.16em',
        color,
        textTransform: 'uppercase',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      {label}
    </span>
  );
}

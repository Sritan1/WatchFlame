'use client';

// Semicircle progress indicator — fills the upper-half arc from left to right
// based on value/total. Used by ChecklistCard to show prep progress.

import { useAesthetic } from '@/lib/aesthetic';

export function ProgressArc({
  value,
  total,
  color,
  size = 92,
}: {
  value: number;
  total: number;
  color: string;
  size?: number;
}) {
  const { ae } = useAesthetic();
  const pct = total > 0 ? value / total : 0;
  const r = (size - 12) / 2;
  const c = size / 2;
  const arcLen = Math.PI * r;
  const dash = arcLen * pct;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size / 2 + 8,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path
          d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
          fill="none"
          stroke={ae.line}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
          fill="none"
          stroke={color}
          strokeWidth="4"
          // A round cap on a zero-length dash still paints a dot (a stray glow at
          // 0% progress), so use a butt cap until there is something to show.
          strokeLinecap={dash > 0 ? 'round' : 'butt'}
          strokeDasharray={`${dash} ${arcLen}`}
          style={{
            transition: 'stroke-dasharray 0.5s cubic-bezier(0.2, 0.7, 0.3, 1)',
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 22,
            fontWeight: ae.titleWeight,
            letterSpacing: ae.titleTracking,
            color: ae.text,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
          <span style={{ color: ae.textMute, fontWeight: 400 }}>/{total}</span>
        </div>
      </div>
    </div>
  );
}

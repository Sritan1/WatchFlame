'use client';

import { useAesthetic } from '@/lib/aesthetic';

/** Eyebrow + optional right-side meta — the section divider used above every
 *  page block (e.g. "STATUS · Berkeley, CA … Updated 2m ago · CAL FIRE · NWS"). */
export function SectionEyebrow({
  children,
  color,
  right,
}: {
  children: React.ReactNode;
  color?: string;
  right?: React.ReactNode;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            background: color ?? ae.textDim,
            boxShadow: color ? `0 0 8px ${color}` : 'none',
          }}
        />
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: color ?? ae.textDim,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          {children}
        </span>
      </div>
      {right ? (
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            letterSpacing: '0.10em',
            color: ae.textMute,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          {right}
        </span>
      ) : null}
    </div>
  );
}

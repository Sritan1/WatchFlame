'use client';

import { useAesthetic } from '@/lib/aesthetic';

/** The section divider above every page block, with optional right-side meta. */
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
      className="app-eyebrow"
      style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 14,
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
            letterSpacing: '0.22em',
            color: color ?? ae.textDim,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          {children}
        </span>
      </div>
      {/* Hairline between the eyebrow and the meta, fading to transparent at the
          ends so it marks a section break instead of drawing a border. */}
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          height: 1,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)',
          minWidth: 24,
          // The hairline must not block clicks on a button in the `right` slot.
          pointerEvents: 'none',
        }}
      />
      {right ? (
        <span
          className="app-eyebrow-meta"
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            color: ae.textMute,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            flexShrink: 0,
          }}
        >
          {right}
        </span>
      ) : null}
    </div>
  );
}

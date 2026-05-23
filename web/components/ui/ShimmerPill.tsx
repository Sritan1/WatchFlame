'use client';

// Risk pill with a traveling sheen and a pulsing-ring dot.
// Used as the small pre-headline tag on the Status hero.

import { useAesthetic } from '@/lib/aesthetic';
import type { RiskTone } from '@/lib/theme';

export function ShimmerPill({ risk }: { risk: RiskTone }) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 13px',
        borderRadius: 999,
        background: `linear-gradient(180deg, rgba(${risk.glow}, 0.16), rgba(${risk.glow}, 0.06))`,
        border: `0.5px solid rgba(${risk.glow}, 0.40)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 0 18px rgba(${risk.glow}, 0.18)`,
        fontFamily: ae.fontMono,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        color: risk.color,
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 99,
            border: `1px solid ${risk.color}`,
            animation: 'ember-pulse 1.8s ease-out infinite',
          }}
        />
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: risk.color,
            boxShadow: `0 0 10px ${risk.color}`,
          }}
        />
      </span>
      <span style={{ position: 'relative' }}>{risk.label}</span>
      {/* Traveling sheen */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: '40%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.30), transparent)',
          animation: 'px-sweep 3.4s cubic-bezier(0.5, 0, 0.5, 1) infinite',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

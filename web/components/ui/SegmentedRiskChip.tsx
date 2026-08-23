'use client';

// The chip above the Status orb, with a label on the left, four rising bars filled to
// the tier on the right, and a hairline between them.

import type { CSSProperties } from 'react';

import { useAesthetic } from '@/lib/aesthetic';
import type { RiskTone } from '@/lib/theme';

type Ae = ReturnType<typeof useAesthetic>['ae'];

export function SegmentedRiskChip({ risk, loading = false }: { risk: RiskTone; loading?: boolean }) {
  const { ae } = useAesthetic();
  if (loading) {
    return <SegmentedLoading ae={ae} />;
  }
  return (
    <div
      role="img"
      aria-label={`Fire risk ${risk.label}, index ${risk.bar} of 4`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 13,
        padding: '9px 15px',
        borderRadius: 10,
        // A frosted backdrop under the tier glow, so the chip stays solid against
        // the busy waves instead of washing out to a faint tint.
        background: `linear-gradient(180deg, rgba(${risk.glow}, 0.17), rgba(${risk.glow}, 0.05) 55%, rgba(255, 255, 255, 0.015)), rgba(30, 27, 25, 0.42)`,
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        border: `0.75px solid rgba(${risk.glow}, 0.42)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.40), 0 0 24px rgba(${risk.glow}, 0.16)`,
      }}
    >
      {/* Left side, the eyebrow and tier label */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <ChipEyebrow ae={ae} />
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.005em',
            color: risk.color,
            textShadow: `0 0 16px rgba(${risk.glow}, 0.5), 0 1px 1px rgba(0, 0, 0, 0.35)`,
          }}
        >
          {risk.label}
        </span>
      </div>

      {/* Hairline divider */}
      <span
        aria-hidden="true"
        style={{
          width: 1,
          height: 34,
          background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.14), transparent)',
        }}
      />

      {/* Right side, ascending index bars and the N/4 IDX readout */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 20 }}>
          {[0, 1, 2, 3].map((i) => {
            const on = i < risk.bar;
            return (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 8 + i * 4,
                  borderRadius: 2,
                  background: on
                    ? `linear-gradient(180deg, rgba(${risk.glow}, 1), ${risk.color})`
                    : 'rgba(255, 255, 255, 0.13)',
                  boxShadow: on
                    ? `0 0 9px rgba(${risk.glow}, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.35)`
                    : 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.07)',
                }}
              />
            );
          })}
        </div>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: ae.textMute,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {risk.bar}/4 IDX
        </span>
      </div>
    </div>
  );
}

/** The chip's "Fire Risk" eyebrow, shared by the live and loading renders. */
function ChipEyebrow({ ae }: { ae: Ae }) {
  return (
    <span
      style={{
        fontFamily: ae.fontMono,
        fontSize: 8.5,
        fontWeight: 600,
        letterSpacing: '0.22em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        color: ae.textMute,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Fire Risk
    </span>
  );
}

// A warm neutral, so no risk color shows until /risk lands.
const LOADING_GLOW = '208, 158, 122';

/** Keeps the segmented silhouette while loading, so the chip doesn't collapse to
 *  a grey box and back. The bars fill in a staggered left-to-right wave. */
function SegmentedLoading({ ae }: { ae: Ae }) {
  const skel = (w: number, h: number): CSSProperties => ({
    position: 'relative',
    overflow: 'hidden',
    width: w,
    height: h,
    borderRadius: 4,
    background: `linear-gradient(180deg, rgba(${LOADING_GLOW}, 0.20), rgba(${LOADING_GLOW}, 0.07))`,
    boxShadow: 'inset 0 0 0 0.5px rgba(255, 255, 255, 0.06)',
  });
  const sheen = (
    <span
      aria-hidden="true"
      className="ember-chip-sheen"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: '55%',
        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent)',
      }}
    />
  );
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Calculating fire risk"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 13,
        padding: '9px 15px',
        borderRadius: 10,
        background: `linear-gradient(180deg, rgba(${LOADING_GLOW}, 0.10), rgba(${LOADING_GLOW}, 0.03) 55%, rgba(255, 255, 255, 0.012)), rgba(30, 27, 25, 0.40)`,
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        border: `0.75px solid rgba(${LOADING_GLOW}, 0.26)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.34), 0 0 20px rgba(${LOADING_GLOW}, 0.09)`,
      }}
    >
      {/* Left side, the real eyebrow and a value placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <ChipEyebrow ae={ae} />
        <span style={skel(71, 16)}>{sheen}</span>
      </div>

      {/* Hairline divider */}
      <span
        aria-hidden="true"
        style={{ width: 1, height: 34, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.12), transparent)' }}
      />

      {/* Right side, charging index bars and an IDX placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 20 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="ember-chip-charge"
              style={{
                width: 5,
                height: 8 + i * 4,
                borderRadius: 2,
                display: 'block',
                animationDelay: `${i * 0.14}s`,
                background: `linear-gradient(180deg, rgba(${LOADING_GLOW}, 0.95), rgba(${LOADING_GLOW}, 0.55))`,
                boxShadow: `0 0 6px rgba(${LOADING_GLOW}, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)`,
              }}
            />
          ))}
        </div>
        <span style={skel(44, 12)}>{sheen}</span>
      </div>
    </div>
  );
}

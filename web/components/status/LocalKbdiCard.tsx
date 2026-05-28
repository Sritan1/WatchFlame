'use client';

// "Your area today" — real KBDI (Keetch-Byram Drought Index, 0–800).
// Premium chrome: TiltCard + corner glow + GridPattern + 4-segment gauge
// with current marker, matching the Score Breakdown row visually.

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

interface Bucket {
  label: string;
  color: string;
  rgb: string;
}

/** Standard KBDI buckets (Keetch & Byram 1968). */
export function kbdiBucket(kbdi: number): Bucket {
  if (kbdi < 200) return { label: 'Moist',    color: '#7ee787', rgb: '126, 231, 135' };
  if (kbdi < 400) return { label: 'Dry',      color: '#fbbf24', rgb: '251, 191, 36'  };
  if (kbdi < 600) return { label: 'Very dry', color: '#fb923c', rgb: '251, 146, 60'  };
  return            { label: 'Drought',  color: '#ef4444', rgb: '239, 68, 68'   };
}

export function LocalKbdiCard({
  kbdi,
  regionalLevel,
  regionalState,
  isLoading = false,
}: {
  kbdi: number | null;
  regionalLevel: string | null;
  regionalState: string | null;
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();
  const loaded = kbdi != null;
  const bucket = loaded ? kbdiBucket(kbdi) : null;

  return (
    <TiltCard
      max={2}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          left: -40,
          width: 220,
          height: 220,
          borderRadius: '50%',
          filter: 'blur(50px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${
            bucket?.rgb ?? RISK_LEVELS.low.glow
          }, 0.10), transparent 70%)`,
        }}
      />
      <GridPattern opacity={0.03} />
      <div style={{ position: 'relative', padding: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Eyebrow>Your Area Today</Eyebrow>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              color: ae.textMute,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {loaded && regionalLevel && regionalState
              ? `${regionalState} · ${regionalLevel}`
              : 'KBDI · Open-Meteo'}
          </span>
        </div>

        {loaded && bucket ? (
          <>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 52,
                    fontWeight: ae.titleWeight,
                    letterSpacing: '-0.04em',
                    color: ae.text,
                    lineHeight: 0.9,
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: `0 0 32px rgba(${bucket.rgb}, 0.32)`,
                  }}
                >
                  <AnimatedNumber value={kbdi} format={(n) => `${Math.round(n)}`} duration={900} />
                </span>
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 12,
                    color: ae.textDim,
                    letterSpacing: '0.10em',
                  }}
                >
                  / 800 KBDI
                </span>
              </div>
              <LevelPill ae={ae} color={bucket.color} glow={bucket.rgb} label={bucket.label} />
            </div>

            <div style={{ marginTop: 20 }}>
              <KbdiBar ae={ae} value={kbdi} />
            </div>

            <p
              style={{
                margin: '20px 0 0',
                paddingTop: 16,
                borderTop: `0.5px solid ${ae.line}`,
                fontFamily: ae.fontBody,
                fontSize: 13,
                lineHeight: 1.5,
                color: ae.textDim,
              }}
            >
              Keetch-Byram Drought Index — fitted from a year of local weather. Replaces the
              days-since-rain proxy when your location is known.
            </p>
          </>
        ) : isLoading ? (
          <>
            <div
              style={{
                marginTop: 16,
                height: 48,
                width: 220,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.04)',
                animation: 'ember-flicker 1.6s ease-in-out infinite',
              }}
            />
            <div
              style={{
                marginTop: 20,
                height: 10,
                width: '100%',
                borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.04)',
              }}
            />
            <p
              style={{
                margin: '20px 0 0',
                paddingTop: 16,
                borderTop: `0.5px solid ${ae.line}`,
                fontFamily: ae.fontBody,
                fontSize: 13,
                lineHeight: 1.5,
                color: ae.textDim,
              }}
            >
              Keetch-Byram Drought Index — fitted from a year of local weather. Replaces the
              days-since-rain proxy when your location is known.
            </p>
          </>
        ) : (
          <>
            <p
              style={{
                margin: '14px 0 0',
                fontFamily: ae.fontBody,
                fontSize: 14,
                color: ae.text,
              }}
            >
              Drought reading unavailable.
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontFamily: ae.fontBody,
                fontSize: 12,
                color: ae.textMute,
                lineHeight: 1.5,
              }}
            >
              Couldn&apos;t reach the Open-Meteo weather archive. The risk score falls back to a
              days-since-rain proxy when this happens.
            </p>
          </>
        )}
      </div>
    </TiltCard>
  );
}

/** 4-segment KBDI gauge with marker dot at the current value. */
function KbdiBar({ ae, value }: { ae: ReturnType<typeof useAesthetic>['ae']; value: number }) {
  const max = 800;
  const pct = Math.min(1, Math.max(0, value / max));
  const segments = [
    { until: 0.25, color: '#7ee787', lbl: 'Moist' },
    { until: 0.5,  color: '#fbbf24', lbl: 'Dry'   },
    { until: 0.75, color: '#fb923c', lbl: 'Very dry' },
    { until: 1.0,  color: '#ef4444', lbl: 'Drought' },
  ];

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 3, height: 10, borderRadius: 99 }}>
          {segments.map((s, i) => {
            const prev = i === 0 ? 0 : segments[i - 1].until;
            const w = (s.until - prev) * 100;
            const active = pct >= prev;
            const rgb = hexToRgb(s.color);
            return (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                style={{
                  width: `${w}%`,
                  borderRadius: 99,
                  background: active
                    ? `linear-gradient(180deg, rgba(${rgb}, 0.65), rgba(${rgb}, 0.25))`
                    : `rgba(${rgb}, 0.10)`,
                  border: `0.5px solid rgba(${rgb}, ${active ? 0.45 : 0.15})`,
                  transition: 'background 0.4s ease',
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: `${pct * 100}%`,
            transform: 'translateX(-50%)',
            width: 16,
            height: 16,
            borderRadius: 99,
            background: '#fff',
            border: `2px solid ${segments.find((s, i) => pct >= (i === 0 ? 0 : segments[i - 1].until) && pct < s.until)?.color ?? segments[0].color}`,
            boxShadow: `0 0 10px ${segments.find((s, i) => pct >= (i === 0 ? 0 : segments[i - 1].until) && pct < s.until)?.color ?? segments[0].color}`,
            transition: 'left 0.7s cubic-bezier(0.3, 1, 0.4, 1)',
          }}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          color: ae.textMute,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {segments.map((s, i) => {
          const prev = i === 0 ? 0 : segments[i - 1].until;
          const inBand = pct >= prev && pct < s.until;
          return (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              style={{
                color: inBand ? s.color : ae.textMute,
                fontWeight: inBand ? 700 : 500,
              }}
            >
              {s.lbl}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LevelPill({
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

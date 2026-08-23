'use client';

// The drought card. Real KBDI where the user is, on a four-band gauge.

import { LevelPill } from '@/components/status/LevelPill';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

interface Bucket {
  label: string;
  color: string;
  rgb: string;
}

/** The standard KBDI bands, from Keetch and Byram. Both the lookup and the bar
 *  read from this, so their thresholds and colors can't drift apart. */
export const KBDI_BUCKETS: ReadonlyArray<Bucket & { until: number }> = [
  { until: 200, label: 'Moist',    color: '#7ee787', rgb: '126, 231, 135' },
  { until: 400, label: 'Dry',      color: '#fbbf24', rgb: '251, 191, 36'  },
  { until: 600, label: 'Very dry', color: '#fb923c', rgb: '251, 146, 60'  },
  { until: 800, label: 'Drought',  color: '#ef4444', rgb: '239, 68, 68'   },
];

export function kbdiBucket(kbdi: number): Bucket {
  for (const b of KBDI_BUCKETS) {
    if (kbdi < b.until) return { label: b.label, color: b.color, rgb: b.rgb };
  }
  return KBDI_BUCKETS[KBDI_BUCKETS.length - 1];
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
              Keetch-Byram Drought Index, fitted from a year of local weather. Replaces the
              days-since-rain proxy when your location is known.
            </p>
          </>
        ) : isLoading ? (
          <>
            <Skeleton width={220} height={48} rounded="md" style={{ marginTop: 16, display: 'block' }} />
            <Skeleton width="100%" height={10} rounded="full" style={{ marginTop: 20, display: 'block' }} />
            {/* The real bar has labels under it, so without these the card grows a
                row taller when the data lands. */}
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <Skeleton width={44} height={9} rounded="sm" />
              <Skeleton width={38} height={9} rounded="sm" />
              <Skeleton width={56} height={9} rounded="sm" />
              <Skeleton width={60} height={9} rounded="sm" />
            </div>
            {/* Same shape as the caption, divider included, so it doesn't flash in
                while the number is still loading. */}
            <div
              style={{
                margin: '20px 0 0',
                paddingTop: 16,
                borderTop: `0.5px solid ${ae.line}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <Skeleton width="100%" height={10} rounded="sm" />
              <Skeleton width="62%" height={10} rounded="sm" />
            </div>
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

/** The gauge, with a dot at the current value, segmented by the same bands. */
function KbdiBar({ ae, value }: { ae: ReturnType<typeof useAesthetic>['ae']; value: number }) {
  const max = KBDI_BUCKETS[KBDI_BUCKETS.length - 1].until;
  const pct = Math.min(1, Math.max(0, value / max));
  const segments = KBDI_BUCKETS.map((b) => ({
    until: b.until / max,
    color: b.color,
    lbl: b.label,
  }));

  // The dot takes the color of the band it sits in.
  const markerColor =
    segments.find((s, i) => pct >= (i === 0 ? 0 : segments[i - 1].until) && pct < s.until)?.color
    ?? segments[segments.length - 1].color;

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
            border: `2px solid ${markerColor}`,
            boxShadow: `0 0 10px ${markerColor}`,
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

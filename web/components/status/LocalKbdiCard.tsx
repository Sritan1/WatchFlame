'use client';

// "Your area today" — real KBDI (Keetch-Byram Drought Index, 0–800).
// Ported from app/components/ui/LocalKbdiCard.tsx. Bucket colors match mobile.

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useAesthetic } from '@/lib/aesthetic';

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
  const pct = loaded ? Math.min(100, (kbdi / 800) * 100) : 0;

  return (
    <div
      className="ember-card ember-card-hover"
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Eyebrow>Your area today</Eyebrow>
        {loaded && regionalLevel && regionalState ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: ae.textDim,
              textTransform: 'uppercase',
            }}
          >
            {regionalState} · {regionalLevel}
          </span>
        ) : null}
      </div>

      {loaded && bucket ? (
        <>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 32,
                fontWeight: ae.titleWeight,
                color: ae.text,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              <AnimatedNumber value={kbdi} format={(n) => `${Math.round(n)}`} />
            </span>
            <span style={{ fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim }}>/ 800 KBDI</span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: bucket.color,
              }}
            >
              {bucket.label}
            </span>
          </div>

          {/* Gradient progress bar with traveling sheen */}
          <div
            style={{
              marginTop: 12,
              height: 6,
              borderRadius: 99,
              background: 'rgba(255, 255, 255, 0.06)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: `linear-gradient(90deg, rgba(${bucket.rgb}, 0.7), ${bucket.color})`,
                borderRadius: 99,
                boxShadow: `0 0 10px ${bucket.color}`,
                transition: 'width 1.2s cubic-bezier(0.3, 1, 0.4, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div className="px-sweep" />
            </div>
          </div>

          <p
            style={{
              margin: '14px 0 0',
              fontFamily: ae.fontBody,
              fontSize: 12,
              color: ae.textMute,
              lineHeight: 1.5,
            }}
          >
            Keetch-Byram Drought Index — fitted from a year of local weather.
            Replaces the days-since-rain proxy when your location is known.
          </p>
        </>
      ) : isLoading ? (
        <>
          <div
            style={{
              marginTop: 12,
              height: 32,
              width: 180,
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              animation: 'ember-flicker 1.6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              marginTop: 12,
              height: 6,
              width: '100%',
              borderRadius: 99,
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          />
          <p
            style={{
              margin: '14px 0 0',
              fontFamily: ae.fontBody,
              fontSize: 12,
              color: ae.textMute,
              lineHeight: 1.5,
            }}
          >
            Keetch-Byram Drought Index — fitted from a year of local weather.
            Replaces the days-since-rain proxy when your location is known.
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: '12px 0 0', fontFamily: ae.fontBody, fontSize: 14, color: ae.text }}>
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
            Couldn&apos;t reach the Open-Meteo weather archive. The risk score
            falls back to a days-since-rain proxy when this happens.
          </p>
        </>
      )}
    </div>
  );
}

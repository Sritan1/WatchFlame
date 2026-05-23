'use client';

// "Vegetation stress" — NDVI anomaly from Sentinel-2 satellite.
// Ported from app/components/ui/LocalNdviCard.tsx. Sign convention:
// negative = drier/sparser than normal (raises fire risk), positive = greener.

import { Eyebrow } from '@/components/ui/Eyebrow';
import { useAesthetic } from '@/lib/aesthetic';

interface Bucket {
  label: string;
  color: string;
  rgb: string;
}

function ndviBucket(anomaly: number): Bucket {
  if (anomaly <= -0.10) return { label: 'Much drier',  color: '#ef4444', rgb: '239, 68, 68'  };
  if (anomaly <= -0.03) return { label: 'Drier',       color: '#fb923c', rgb: '251, 146, 60' };
  if (anomaly <   0.03) return { label: 'About normal', color: '#fbbf24', rgb: '251, 191, 36' };
  if (anomaly <   0.10) return { label: 'Greener',     color: '#7ee787', rgb: '126, 231, 135' };
  return                  { label: 'Much greener', color: '#3FB68B', rgb: '63, 182, 139'  };
}

export function LocalNdviCard({
  ndviAnomaly,
  isLoading = false,
}: {
  ndviAnomaly: number | null;
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();
  const loaded = ndviAnomaly != null;
  const bucket = loaded ? ndviBucket(ndviAnomaly) : null;
  // Map anomaly [-0.30, +0.30] → [0, 100] for the centered bar position.
  const pct = loaded
    ? Math.max(0, Math.min(100, 50 + (ndviAnomaly / 0.30) * 50))
    : 50;

  return (
    <div
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Eyebrow>Vegetation stress</Eyebrow>
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
          NDVI · Sentinel-2
        </span>
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
              {ndviAnomaly >= 0 ? '+' : ''}
              {ndviAnomaly.toFixed(3)}
            </span>
            <span style={{ fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim }}>anomaly</span>
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

          {/* Centered diverging bar: 0% = much drier, 50% = normal, 100% = much greener */}
          <div
            style={{
              marginTop: 12,
              height: 6,
              borderRadius: 99,
              background:
                'linear-gradient(90deg, rgba(239,68,68,0.25), rgba(251,191,36,0.15) 50%, rgba(126,231,135,0.25))',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -2,
                bottom: -2,
                width: 0.5,
                background: ae.lineStrong,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -4,
                bottom: -4,
                left: `calc(${pct}% - 7px)`,
                width: 14,
                height: 14,
                borderRadius: 99,
                background: bucket.color,
                border: '2px solid #fff',
                boxShadow: `0 0 10px ${bucket.color}`,
                transition: 'left 0.6s cubic-bezier(0.3, 1, 0.4, 1)',
              }}
            />
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
            Current NDVI minus the same-month climatology (last 3 years) in a 1 km buffer.
            Negative = drier than normal, which raises fire risk.
          </p>
        </>
      ) : isLoading ? (
        <>
          <div
            style={{
              marginTop: 12,
              height: 32,
              width: 160,
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
        </>
      ) : (
        <>
          <p style={{ margin: '12px 0 0', fontFamily: ae.fontBody, fontSize: 14, color: ae.text }}>
            Satellite imagery unavailable.
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
            Heavy cloud cover, outside Sentinel-2 coverage, or upstream throttling. The
            score falls back to a calendar-season multiplier when this happens.
          </p>
        </>
      )}
    </div>
  );
}

'use client';

// Vegetation stress, the NDVI anomaly from Sentinel-2. Chrome matches
// LocalKbdiCard, with a diverging bar centered on zero.

import { LevelPill } from '@/components/status/LevelPill';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

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
          right: -40,
          width: 220,
          height: 220,
          borderRadius: '50%',
          filter: 'blur(50px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${
            bucket?.rgb ?? RISK_LEVELS.moderate.glow
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
          <Eyebrow>Vegetation Stress</Eyebrow>
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
            NDVI · Sentinel-2
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
                // Wrap so the level pill drops below the value instead of getting
                // clipped on a narrow screen. The desktop card has room and never
                // wraps.
                flexWrap: 'wrap',
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
                  {ndviAnomaly >= 0 ? '+' : ''}
                  <AnimatedNumber value={ndviAnomaly} format={(n) => n.toFixed(3)} duration={900} />
                </span>
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 12,
                    color: ae.textDim,
                    letterSpacing: '0.10em',
                  }}
                >
                  anomaly
                </span>
              </div>
              <LevelPill ae={ae} color={bucket.color} glow={bucket.rgb} label={bucket.label} />
            </div>

            <div style={{ marginTop: 20 }}>
              <NdviGauge ae={ae} value={ndviAnomaly} bucketColor={bucket.color} />
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
              How healthy the plants around you are right now versus their normal level for this
              time of year. Drier-than-usual vegetation burns more easily.
            </p>
          </>
        ) : isLoading ? (
          <>
            <Skeleton width={180} height={48} rounded="md" style={{ marginTop: 16, display: 'block' }} />
            <Skeleton width="100%" height={10} rounded="full" style={{ marginTop: 20, display: 'block' }} />
            {/* NdviGauge draws labels under the bar, so without this row the card
                jumps a line taller on load. */}
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <Skeleton width={48} height={9} rounded="sm" />
              <Skeleton width={72} height={9} rounded="sm" />
              <Skeleton width={48} height={9} rounded="sm" />
            </div>
            {/* Matches the two-line caption and its divider, so the text doesn't
                flash in while the number and gauge are still loading. */}
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
              Heavy cloud cover, outside Sentinel-2 coverage, or upstream throttling. The score
              falls back to a calendar-season multiplier when this happens.
            </p>
          </>
        )}
      </div>
    </TiltCard>
  );
}

/** Diverging gauge, red on the left and green on the right of a zero tick. The
 *  marker scales the anomaly range onto 0 to 100 percent. */
function NdviGauge({
  ae,
  value,
  bucketColor,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  value: number;
  bucketColor: string;
}) {
  const min = -0.3;
  const max = 0.3;
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const red = '#ef4444';
  const amber = RISK_LEVELS.moderate.color;
  const green = RISK_LEVELS.low.color;
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div
          style={{
            height: 10,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${red} 0%, ${amber} 38%, ${amber} 62%, ${green} 100%)`,
            border: '0.5px solid rgba(255,255,255,0.10)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
            position: 'relative',
          }}
        >
          {/* Zero tick */}
          <div
            style={{
              position: 'absolute',
              top: -3,
              left: '50%',
              width: 1.5,
              height: 16,
              marginLeft: -0.75,
              background: 'rgba(255,255,255,0.5)',
            }}
          />
        </div>
        {/* Marker */}
        <div
          style={{
            position: 'absolute',
            top: -3,
            left: `${pct * 100}%`,
            transform: 'translateX(-50%)',
            width: 16,
            height: 16,
            borderRadius: 99,
            background: bucketColor,
            border: '2px solid #fff',
            boxShadow: `0 0 10px ${bucketColor}`,
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
        <span style={{ color: red }}>Stressed</span>
        <span style={{ color: amber, fontWeight: value > -0.03 && value < 0.03 ? 700 : 500 }}>
          About Normal
        </span>
        <span style={{ color: green }}>Healthy</span>
      </div>
    </div>
  );
}


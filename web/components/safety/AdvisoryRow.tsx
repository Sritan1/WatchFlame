'use client';

// 2-col row below the checklist:
//   1. Safety Status banner — title + body are computed UPSTREAM in
//      SafetyScreen's computeBannerSignal() so the rule that combines
//      fire-weather and closest-fire-threat lives in one place.
//   2. "Closest Active Fire" mini stat with proximity meter.
// Real data via incidents + FIRMS queries.

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { convertDistance, useUnits } from '@/lib/use-units';

/** Minimal shape for AdvisoryRow's closest-fire display — works for both
 *  NamedIncident (NIFC/Cal Fire) and synthesized FIRMS satellite detections. */
export interface ClosestFireSummary {
  name: string;
  distance_mi: number;
}

/** Resolved banner content. Computed in SafetyScreen so the
 *  fire-weather × closest-fire rule lives in one place. */
export interface BannerSignal {
  /** Drives palette + icon (low = green check, else amber/orange warn). */
  level: RiskLevel;
  title: string;
  subtitle: string;
}

export function AdvisoryRow({
  banner,
  closestFire,
  closestBearingLabel,
  closestSeverity,
  isLoading = false,
}: {
  banner: BannerSignal;
  closestFire: ClosestFireSummary | null;
  closestBearingLabel: string;
  closestSeverity: RiskLevel | null;
  isLoading?: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  // Palette for the banner — driven by `banner.level`. Use the raw RISK_LEVELS
  // (not getRisk with accent override) so 'low' stays green even when the
  // user's accent is amber/orange/red.
  const tone = RISK_LEVELS[banner.level];
  // Palette for the closest-fire side. When unresolved (no fire OR loading),
  // fall back to the banner's tone so the row reads cohesively.
  const fr = closestSeverity ? getRisk(closestSeverity, accent) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Safety Status — title + body driven by the combined banner signal */}
      <div
        style={{
          background: ae.surface,
          border: `0.5px solid rgba(${tone.glow}, 0.20)`,
          borderRadius: ae.radius,
          padding: 18,
        }}
      >
        {isLoading ? (
          <SafetyStatusSkeleton />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `rgba(${tone.glow}, 0.10)`,
                  border: `0.5px solid rgba(${tone.glow}, 0.28)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={banner.level === 'low' ? 'check' : 'warn'}
                  size={15}
                  color={tone.color}
                  strokeWidth={1.8}
                />
              </div>
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 16,
                  fontWeight: ae.titleWeight,
                  color: tone.color,
                  letterSpacing: ae.titleTracking,
                }}
              >
                {banner.title}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: ae.fontBody,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: ae.textDim,
              }}
            >
              {banner.subtitle}
            </p>
          </>
        )}
      </div>

      {/* Closest Active Fire */}
      <div
        style={{
          background: ae.surface,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `rgba(${fr?.glow ?? tone.glow}, 0.10)`,
              border: `0.5px solid rgba(${fr?.glow ?? tone.glow}, 0.28)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="flame" size={15} color={fr?.color ?? tone.color} strokeWidth={1.6} />
          </div>
          <Eyebrow>Closest Active Fire</Eyebrow>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div>
            {closestFire ? (
              <>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 28,
                    fontWeight: ae.titleWeight,
                    color: ae.text,
                    letterSpacing: ae.titleTracking,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {convertDistance(closestFire.distance_mi, units.distance).toFixed(1)}{' '}
                  <span style={{ fontSize: 14, color: ae.textDim, fontWeight: 400 }}>
                    {units.distance} {closestBearingLabel}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: ae.fontMono,
                    fontSize: 11,
                    color: ae.textMute,
                    letterSpacing: '0.06em',
                  }}
                >
                  {closestFire.name}
                </div>
              </>
            ) : isLoading ? (
              <>
                <Skeleton width={130} height={28} rounded="md" />
                <div style={{ marginTop: 6 }}>
                  <Skeleton width={90} height={11} rounded="sm" />
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 28,
                    fontWeight: ae.titleWeight,
                    color: ae.textDim,
                    letterSpacing: ae.titleTracking,
                    lineHeight: 1,
                  }}
                >
                  None{' '}
                  <span style={{ fontSize: 14, color: ae.textDim, fontWeight: 400 }}>
                    detected
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: ae.fontMono,
                    fontSize: 11,
                    color: ae.textMute,
                    letterSpacing: '0.06em',
                  }}
                >
                  None within range
                </div>
              </>
            )}
          </div>
          {/* Proximity meter — 6 bars, left-to-right small-to-tall.
           *  Lit bar position scales with distance: closer fire → rightmost
           *  (tallest) bar lit; farther fire → leftmost bar; >50 mi → leftmost. */}
          <ProximityMeter
            distanceMi={closestFire?.distance_mi ?? null}
            color={fr?.color ?? tone.color}
            glow={fr?.glow ?? tone.glow}
          />
        </div>
      </div>
    </div>
  );
}

/** Inline skeleton for the Safety Status card. Matches the live layout's
 *  icon-tile + title + two body lines, so the swap when data lands doesn't
 *  jolt the row height. */
function SafetyStatusSkeleton() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Skeleton width={32} height={32} rounded="md" />
        <Skeleton width={140} height={16} rounded="sm" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width={'100%'} height={12} rounded="sm" />
        <Skeleton width={'82%'} height={12} rounded="sm" />
      </div>
    </>
  );
}

const PROXIMITY_METER_MAX_MI = 50;

function ProximityMeter({
  distanceMi,
  color,
  glow,
}: {
  distanceMi: number | null;
  color: string;
  glow: string;
}) {
  const NUM_BARS = 6;
  const binWidth = PROXIMITY_METER_MAX_MI / NUM_BARS;
  let litIndex: number;
  if (distanceMi == null) {
    litIndex = -1;
  } else if (distanceMi >= PROXIMITY_METER_MAX_MI) {
    litIndex = 0;
  } else {
    litIndex = NUM_BARS - 1 - Math.floor(distanceMi / binWidth);
  }
  const heights = [10, 15, 20, 26, 31, 36];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
      {heights.map((h, i) => {
        const isLit = i === litIndex;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div
            key={i}
            style={{
              width: 5,
              height: h,
              borderRadius: 1,
              background: isLit ? color : `rgba(${glow}, 0.18)`,
              boxShadow: isLit ? `0 0 8px ${color}` : 'none',
              transition: 'background 0.3s ease, box-shadow 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
}

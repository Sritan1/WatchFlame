'use client';

// The band under the Safety hero, the status banner on one side, the closest fire
// and its proximity meter on the other. The wording is decided in SafetyScreen, so
// the rule producing it lives in one place.

import { Icon } from '@/components/Icon';
import { GLASS_CARD } from '@/components/safety/glass';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { convertDistance, useUnits } from '@/lib/use-units';

/** Just enough about a fire to display it, from either feed. */
export interface ClosestFireSummary {
  name: string;
  distance_mi: number;
}

/** The banner's finished wording, decided in SafetyScreen. */
export interface BannerSignal {
  /** Sets the color and the icon, a green tick or a warning. */
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
  // Straight from the palette, ignoring the accent, so an all-clear is always green.
  const tone = RISK_LEVELS[banner.level];
  // The other side borrows the banner's color when there's no fire to color it.
  const fr = closestSeverity ? getRisk(closestSeverity, accent) : null;
  const fireTone = fr ?? tone;

  return (
    <div
      className="app-stack"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
    >
      {/* Safety status. Title and body both come off the banner signal */}
      <div className="app-card-pad" style={{ ...GLASS_CARD, borderRadius: ae.radius, padding: '26px 28px' }}>
        {isLoading ? (
          <SafetyStatusSkeleton />
        ) : (
          <>
            {/* Framing eyebrow. This is the situation right now, fire weather plus
                active fires. Not the same as the Status tier, which also folds in
                ignition likelihood. */}
            <div
              style={{
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.14em',
                color: ae.textMute,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                marginBottom: 14,
              }}
            >
              Current conditions + active fires
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: `rgba(${tone.glow}, 0.12)`,
                  border: `0.5px solid rgba(${tone.glow}, 0.30)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={banner.level === 'low' ? 'check' : 'warn'}
                  size={22}
                  color={tone.color}
                  strokeWidth={banner.level === 'low' ? 2.4 : 1.8}
                />
              </div>
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 23,
                  fontWeight: ae.titleWeight,
                  color: tone.color,
                  letterSpacing: ae.titleTracking,
                  lineHeight: 1,
                }}
              >
                {banner.title}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: ae.fontBody,
                fontSize: 15.5,
                lineHeight: 1.55,
                color: ae.textDim,
                maxWidth: 360,
              }}
            >
              {banner.subtitle}
            </p>
          </>
        )}
      </div>

      {/* Closest Active Fire */}
      <div
        className="app-card-pad"
        style={{
          ...GLASS_CARD,
          borderRadius: ae.radius,
          padding: '26px 28px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: `rgba(${fireTone.glow}, 0.10)`,
              border: `0.5px solid rgba(${fireTone.glow}, 0.26)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="flame" size={17} color={fireTone.color} strokeWidth={1.7} />
          </div>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: ae.textDim,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Closest Active Fire
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 'auto',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {closestFire ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span
                    style={{
                      fontFamily: ae.fontDisplay,
                      fontSize: 42,
                      fontWeight: ae.titleWeight,
                      color: ae.text,
                      letterSpacing: ae.titleTracking,
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 0.95,
                    }}
                  >
                    {convertDistance(closestFire.distance_mi, units.distance).toFixed(1)}
                  </span>
                  <span style={{ fontFamily: ae.fontBody, fontSize: 18, color: ae.textDim }}>
                    {units.distance} {closestBearingLabel}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: ae.fontMono,
                    fontSize: 13,
                    color: ae.textMute,
                    letterSpacing: '0.02em',
                  }}
                >
                  {closestFire.name}
                </div>
              </>
            ) : isLoading ? (
              <>
                <Skeleton width={150} height={40} rounded="md" />
                <div style={{ marginTop: 8 }}>
                  <Skeleton width={110} height={13} rounded="sm" />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span
                    style={{
                      fontFamily: ae.fontDisplay,
                      fontSize: 42,
                      fontWeight: ae.titleWeight,
                      color: ae.text,
                      letterSpacing: ae.titleTracking,
                      lineHeight: 0.95,
                    }}
                  >
                    None
                  </span>
                  <span style={{ fontFamily: ae.fontBody, fontSize: 18, color: ae.textDim }}>
                    detected
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: ae.fontMono,
                    fontSize: 13,
                    color: ae.textMute,
                    letterSpacing: '0.02em',
                  }}
                >
                  None within range
                </div>
              </>
            )}
          </div>
          {/* Proximity meter. The nearer the fire, the further right the lit bar. */}
          <ProximityMeter
            distanceMi={closestFire?.distance_mi ?? null}
            color={fireTone.color}
            glow={fireTone.glow}
          />
        </div>
      </div>
    </div>
  );
}

/** Shaped like the real banner, so the row doesn't jump when data arrives. */
function SafetyStatusSkeleton() {
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Skeleton width={190} height={11} rounded="sm" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Skeleton width={44} height={44} rounded="md" />
        <Skeleton width={150} height={23} rounded="sm" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Skeleton width={'100%'} height={13} rounded="sm" />
        <Skeleton width={'82%'} height={13} rounded="sm" />
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
  const heights = [12, 17, 22, 27, 32, 37];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 37 }}>
      {heights.map((h, i) => {
        const isLit = i === litIndex;
        return (
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

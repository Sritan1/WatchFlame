'use client';

// 2-col row below the checklist:
//   1. Level-driven Safety Status card (title + body change per risk level —
//      ports mobile's WarningBanner CONFIG verbatim).
//   2. "Closest Active Fire" mini stat with proximity meter.
// Real data via incidents + FIRMS queries.

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, type RiskLevel } from '@/lib/theme';
import { useUnits } from '@/lib/use-units';

/** Minimal shape for AdvisoryRow's closest-fire display — works for both
 *  NamedIncident (NIFC/Cal Fire) and synthesized FIRMS satellite detections. */
export interface ClosestFireSummary {
  name: string;
  distance_mi: number;
}

interface LevelConfig {
  color: string;
  rgb: string;
  title: string;
  subtitle: string;
}

// Mirrors app/components/ui/WarningBanner.tsx CONFIG exactly. Don't tweak
// these strings without also updating mobile.
const LEVEL_CONFIG: Record<RiskLevel, LevelConfig> = {
  low: {
    color: '#7ee787',
    rgb: '126, 231, 135',
    title: 'All Clear',
    subtitle: 'No immediate fire risk for your area. Stay informed and check back regularly.',
  },
  moderate: {
    color: '#e8b339',
    rgb: '232, 179, 57',
    title: 'Stay Aware',
    subtitle: 'Conditions favor fire growth. Review your plan and keep an eye on local alerts.',
  },
  high: {
    color: '#fb923c',
    rgb: '251, 146, 60',
    title: 'Evacuation Warning',
    subtitle: 'Prepare to evacuate. Monitor conditions and remain alert for official orders.',
  },
  extreme: {
    color: '#ef4444',
    rgb: '239, 68, 68',
    title: 'EVACUATE IMMEDIATELY',
    subtitle:
      'Extreme fire conditions. Leave now via your nearest evacuation route. Call 911 if you cannot evacuate safely.',
  },
};

export function AdvisoryRow({
  riskLevel,
  closestFire,
  closestBearingLabel,
  closestSeverity,
  isLoading = false,
}: {
  riskLevel: RiskLevel;
  closestFire: ClosestFireSummary | null;
  closestBearingLabel: string;
  closestSeverity: RiskLevel | null;
  isLoading?: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const distConverted = (mi: number) => (units.distance === 'km' ? mi * 1.60934 : mi);
  const r = getRisk(riskLevel, accent);
  const fr = closestSeverity ? getRisk(closestSeverity, accent) : null;
  const cfg = LEVEL_CONFIG[riskLevel];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Level-driven Safety Status — title + body change per risk level */}
      <div
        style={{
          background: ae.surface,
          border: `0.5px solid rgba(${cfg.rgb}, 0.20)`,
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
              background: `rgba(${cfg.rgb}, 0.10)`,
              border: `0.5px solid rgba(${cfg.rgb}, 0.28)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={riskLevel === 'low' ? 'check' : 'warn'}
              size={15}
              color={cfg.color}
              strokeWidth={1.8}
            />
          </div>
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 16,
              fontWeight: ae.titleWeight,
              color: cfg.color,
              letterSpacing: ae.titleTracking,
            }}
          >
            {cfg.title}
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
          {cfg.subtitle}
        </p>
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
              background: `rgba(${fr?.glow ?? r.glow}, 0.10)`,
              border: `0.5px solid rgba(${fr?.glow ?? r.glow}, 0.28)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="flame" size={15} color={fr?.color ?? r.color} strokeWidth={1.6} />
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
                  {distConverted(closestFire.distance_mi).toFixed(1)}{' '}
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
            color={fr?.color ?? r.color}
            glow={fr?.glow ?? r.glow}
          />
        </div>
      </div>
    </div>
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

'use client';

// Right panel of the Risk hero: weighted bars for each factor + season multiplier card.
// Weights come from the fitted V4 exponents (V4_WEIGHT_PCT, mirroring the
// backend); the factor values come from the live RiskResponse.factors.

import { useState } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/Icon';
import { IndexBadge } from '@/components/ui/IndexBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ExplainerModal } from '@/components/risk/ExplainerModal';
import { useAesthetic } from '@/lib/aesthetic';
import { FACTOR_COLORS, RISK_LEVELS } from '@/lib/theme';
import { V4_WEIGHT_PCT } from '@/lib/v4-weights';

interface FactorRow {
  label: string;
  weight: number;
  factor: number;
  color: string;
  glowRgb: string;
  caption: string;
}

export function FactorBreakdown({
  vpd,
  wind,
  drought,
  season,
  seasonLabel,
  caption,
  vegetationDetail,
  isLoading = false,
}: {
  vpd: number;
  wind: number;
  drought: number;
  /** Vegetation multiplier value (NDVI-derived OR calendar-season scalar). */
  season: number;
  /** Short source label — "NDVI" or "Spring"/"Summer"/etc. */
  seasonLabel: string;
  /** Three captions, one per row — provided by parent so we can keep this dumb. */
  caption: { vpd: string; wind: string; drought: string };
  /** One-line context for the vegetation factor — e.g. "NDVI anomaly: -0.05
   *  (drier than 3-yr norm)" or "Calendar season — Sentinel-2 unavailable".
   *  Optional: falls back to the existing minimal display when absent. */
  vegetationDetail?: string;
  /** Inputs are re-seeding (e.g. a location switch). Mask the live values with
   *  skeletons so the panel doesn't paint the PREVIOUS location's numbers next
   *  to the rest of the hero (which is already skeletoning). The static labels
   *  + layout stay, so the panel height doesn't jump. */
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();
  const [explainerOpen, setExplainerOpen] = useState(false);

  const rows: FactorRow[] = [
    { label: 'Vapor Pressure Deficit', weight: V4_WEIGHT_PCT.vpd,     factor: vpd,     color: FACTOR_COLORS.vpd.color,     glowRgb: FACTOR_COLORS.vpd.glow,     caption: caption.vpd },
    { label: 'Wind',                   weight: V4_WEIGHT_PCT.wind,    factor: wind,    color: FACTOR_COLORS.wind.color,    glowRgb: FACTOR_COLORS.wind.glow,    caption: caption.wind },
    { label: 'Drought',                weight: V4_WEIGHT_PCT.drought, factor: drought, color: FACTOR_COLORS.drought.color, glowRgb: FACTOR_COLORS.drought.glow, caption: caption.drought },
  ];

  return (
    <div
      className="ember-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        padding: 26,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>Factor Breakdown</Eyebrow>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            color: ae.textMute,
            letterSpacing: '0.10em',
          }}
        >
          weighted sum
        </span>
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
        {rows.map((f, i) => (
          <div key={f.label}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IndexBadge n={i + 1} />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: f.color,
                    boxShadow: `0 0 6px ${f.color}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 15,
                    fontWeight: 600,
                    color: ae.text,
                    letterSpacing: ae.titleTracking,
                  }}
                >
                  {f.label}
                </span>
              </div>
              {isLoading ? (
                <Skeleton width={58} height={11} rounded="sm" />
              ) : (
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 11,
                    color: ae.textDim,
                    letterSpacing: '0.04em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {f.weight}% · {f.factor.toFixed(2)}
                </span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 99, background: ae.line, overflow: 'hidden' }}>
              <div
                style={{
                  width: isLoading ? '0%' : `${f.factor * 100}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: `linear-gradient(90deg, rgba(${f.glowRgb}, 0.5), ${f.color})`,
                  boxShadow: `0 0 8px ${f.color}`,
                  transition: 'width 0.4s cubic-bezier(0.2, 0.7, 0.3, 1)',
                }}
              />
            </div>
            <div style={{ marginTop: 6 }}>
              {isLoading ? (
                <Skeleton width={110} height={10} rounded="sm" />
              ) : (
                <div
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 10.5,
                    color: ae.textMute,
                    letterSpacing: '0.04em',
                  }}
                >
                  {f.caption}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Vegetation factor — lifted above the "How is this calculated?"
         *  button so NDVI gets the visual weight its operational importance
         *  deserves. Mathematically the multiplier sits outside the weighted
         *  sum (raw = vpd^a × wind^b × drought^c with fitted a/b/c; score =
         *  vegFactor × raw), so it doesn't get a percentage-bar treatment — but it does
         *  get its own card-within-a-card with the source named explicitly
         *  ("NDVI" vs "Summer"/etc) and an inline context line. */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: `0.5px solid ${ae.line}`,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: `linear-gradient(180deg, rgba(${RISK_LEVELS.low.glow}, 0.06), rgba(${RISK_LEVELS.low.glow}, 0.02))`,
              border: `0.5px solid rgba(${RISK_LEVELS.low.glow}, 0.20)`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Eyebrow>Vegetation factor</Eyebrow>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: ae.fontMono,
                    fontSize: 10.5,
                    color: ae.textMute,
                    letterSpacing: '0.14em',
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  }}
                >
                  Source · {seasonLabel}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {isLoading ? (
                  <Skeleton width={62} height={28} rounded="sm" />
                ) : (
                  <div
                    style={{
                      fontFamily: ae.fontDisplay,
                      fontSize: 28,
                      fontWeight: 800,
                      color: RISK_LEVELS.low.color,
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1,
                    }}
                  >
                    ×{season.toFixed(2)}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: ae.fontMono,
                    fontSize: 9.5,
                    color: ae.textMute,
                    letterSpacing: '0.14em',
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  }}
                >
                  Applied to weighted sum
                </div>
              </div>
            </div>
            {isLoading ? (
              <div style={{ marginTop: 10 }}>
                <Skeleton width={'80%'} height={12} rounded="sm" />
              </div>
            ) : vegetationDetail ? (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: ae.fontBody,
                  fontSize: 12.5,
                  color: ae.textDim,
                  lineHeight: 1.45,
                }}
              >
                {vegetationDetail}
              </div>
            ) : null}
          </div>

          {/* Existing methodology link — kept in its existing single-link
           *  position so it covers VPD/Wind/Drought + the vegetation factor
           *  (the ExplainerModal documents all four). */}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setExplainerOpen(true)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: `rgba(${RISK_LEVELS.low.glow}, 0.08)`,
                border: `0.5px solid rgba(${RISK_LEVELS.low.glow}, 0.22)`,
                color: RISK_LEVELS.low.color,
                cursor: 'pointer',
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.10em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="info" size={11} color={RISK_LEVELS.low.color} strokeWidth={1.8} />
              How is this calculated?
            </button>
          </div>
        </div>
      </div>

      <ExplainerModal open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </div>
  );
}

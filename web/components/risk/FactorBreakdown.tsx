'use client';

// Right panel of the Risk hero: weighted bars for each factor + season multiplier card.
// Weights are constant (VPD 50%, Wind 30%, Drought 20%); the factor values come
// from the live RiskResponse.factors.

import { useState } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/Icon';
import { IndexBadge } from '@/components/ui/IndexBadge';
import { ExplainerModal } from '@/components/risk/ExplainerModal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

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
}: {
  vpd: number;
  wind: number;
  drought: number;
  season: number;
  seasonLabel: string;
  /** Three captions, one per row — provided by parent so we can keep this dumb. */
  caption: { vpd: string; wind: string; drought: string };
}) {
  const { ae } = useAesthetic();
  const [explainerOpen, setExplainerOpen] = useState(false);

  const rows: FactorRow[] = [
    { label: 'Vapor Pressure Deficit', weight: 50, factor: vpd,     color: '#FF7A3A', glowRgb: '255, 122, 58', caption: caption.vpd },
    { label: 'Wind',                   weight: 30, factor: wind,    color: '#4FA8FF', glowRgb: '79, 168, 255', caption: caption.wind },
    { label: 'Drought',                weight: 20, factor: drought, color: '#E8B339', glowRgb: '232, 179, 57', caption: caption.drought },
  ];

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        padding: 26,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
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
            </div>
            <div style={{ height: 6, borderRadius: 99, background: ae.line, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${f.factor * 100}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: `linear-gradient(90deg, rgba(${f.glowRgb}, 0.5), ${f.color})`,
                  boxShadow: `0 0 8px ${f.color}`,
                  transition: 'width 0.4s cubic-bezier(0.2, 0.7, 0.3, 1)',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textMute,
                letterSpacing: '0.04em',
              }}
            >
              {f.caption}
            </div>
          </div>
        ))}

        {/* Season multiplier footer */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: `0.5px solid ${ae.line}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Eyebrow>Season multiplier</Eyebrow>
            <div
              style={{
                marginTop: 4,
                fontFamily: ae.fontDisplay,
                fontSize: 18,
                fontWeight: 600,
                color: ae.text,
                letterSpacing: ae.titleTracking,
              }}
            >
              ×{season.toFixed(2)}{' '}
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  color: ae.textMute,
                  fontWeight: 400,
                  marginLeft: 6,
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                {seasonLabel}
              </span>
            </div>
          </div>
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

      <ExplainerModal open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </div>
  );
}

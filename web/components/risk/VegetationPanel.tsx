'use client';

// Vegetation Signal panel — left half of the inputs row pair with Drought.
// "Season proxy" mode shows the 4 season buttons with their multipliers.
// "Vegetation (NDVI)" mode swaps in an NDVI anomaly slider [-0.30..+0.30].

import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { Icon } from '@/components/Icon';
import { InputPanel } from '@/components/risk/InputPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { Season } from '@/lib/api';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

const SEASON_MULT: Record<Season, number> = {
  winter: 0.4,
  spring: 0.8,
  summer: 1.0,
  fall: 0.9,
};

export type VegMode = 'season' | 'ndvi';

export function VegetationPanel({
  mode,
  onModeChange,
  season,
  onSeasonChange,
  ndvi,
  onNdviChange,
  color,
  glowRgb,
  ndviFooter,
  isLoading = false,
}: {
  mode: VegMode;
  onModeChange: (m: VegMode) => void;
  season: Season;
  onSeasonChange: (s: Season) => void;
  ndvi: number;
  onNdviChange: (n: number) => void;
  color: string;
  glowRgb: string;
  /** Slot rendered inside the NDVI InputPanel when mode === 'ndvi'. Used for
   *  the "Couldn't fetch NDVI" warning when CDSE Sentinel-2 fetch fails. */
  ndviFooter?: ReactNode;
  /** True during location-switch transitions — renders skeletons for the
   *  season-button grid (or the inner NDVI slider via its own isLoading)
   *  so the panel matches the slider tiles' loading rhythm. */
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();

  return (
    <div
      className="ember-card ember-card-hover"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Eyebrow>Vegetation Signal</Eyebrow>
        <GlassSegmented<VegMode>
          value={mode}
          options={[
            // NDVI listed first so the default "measured satellite data"
            // option reads as primary; season proxy reads as the fallback.
            { id: 'ndvi', label: 'Vegetation (NDVI)' },
            { id: 'season', label: 'Season proxy' },
          ]}
          onChange={onModeChange}
          color={color}
          glowRgb={glowRgb}
          size="sm"
        />
      </div>

      {mode === 'season' && isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} width="100%" height={56} rounded="md" />
          ))}
        </div>
      ) : mode === 'season' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {(['winter', 'spring', 'summer', 'fall'] as Season[]).map((s) => {
            const active = season === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSeasonChange(s)}
                style={{
                  padding: '12px 6px',
                  textAlign: 'center',
                  borderRadius: 10,
                  background: active ? `rgba(${glowRgb}, 0.12)` : ae.surface,
                  border: `0.5px solid ${active ? `rgba(${glowRgb}, 0.30)` : ae.line}`,
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                }}
              >
                <div
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 10,
                    fontWeight: 600,
                    color: active ? color : ae.textMute,
                    letterSpacing: '0.14em',
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  }}
                >
                  {s}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: ae.fontDisplay,
                    fontSize: 16,
                    fontWeight: 600,
                    color: active ? ae.text : ae.textDim,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: ae.titleTracking,
                  }}
                >
                  ×{SEASON_MULT[s].toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <InputPanel
          label="NDVI Anomaly"
          value={ndvi}
          unit=""
          min={-0.3}
          max={0.3}
          step={0.001}
          color={color}
          glowRgb={glowRgb}
          index={5}
          caption="Current NDVI minus the same-month climatology. Negative = drier/sparser than normal (higher risk)."
          onChange={onNdviChange}
          footer={ndviFooter}
          isLoading={isLoading}
        />
      )}

      {/* Fallback callout — only shown in season mode */}
      {mode === 'season' ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.05), rgba(${AMBER_RGB}, 0.02))`,
            border: `0.5px solid rgba(${AMBER_RGB}, 0.22)`,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: `rgba(${AMBER_RGB}, 0.12)`,
              border: `0.5px solid rgba(${AMBER_RGB}, 0.30)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="info" size={11} color={AMBER} strokeWidth={1.6} />
          </div>
          <span
            style={{
              flex: 1,
              fontFamily: ae.fontBody,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: ae.textDim,
            }}
          >
            <span style={{ color: AMBER, fontWeight: 600 }}>Fallback signal. </span>
            Status uses NDVI from satellite when available. Season is a coarse proxy used only when imagery isn&apos;t available.
          </span>
        </div>
      ) : null}
    </div>
  );
}

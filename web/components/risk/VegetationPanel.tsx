'use client';

// Vegetation Signal panel — left half of the inputs row pair with Drought.
// "Season proxy" mode shows the 4 season buttons with their multipliers.
// "Vegetation (NDVI)" mode swaps in an NDVI anomaly slider [-0.30..+0.30].

import { useState, type ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { Icon } from '@/components/Icon';
import { InputPanel } from '@/components/risk/InputPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { Season } from '@/lib/api';
import { SEASON_MULT } from '@/lib/v4-weights';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

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
  const [dismissed, setDismissed] = useState(false);
  // Once the callout is dismissed in season mode, center the season buttons in
  // the freed-up vertical space instead of leaving a gap at the bottom.
  const centerBoxes = mode === 'season' && dismissed;

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
        display: 'flex',
        flexDirection: 'column',
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
            // option reads as primary; the season estimate reads as the fallback.
            { id: 'ndvi', label: 'Vegetation (NDVI)' },
            { id: 'season', label: 'By season' },
          ]}
          onChange={onModeChange}
          color={color}
          glowRgb={glowRgb}
          size="sm"
        />
      </div>

      <div style={centerBoxes ? { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
      {mode === 'season' && isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} width="100%" height={56} rounded="md" />
          ))}
        </div>
      ) : mode === 'season' ? (
        <div
          style={
            centerBoxes
              ? {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gridTemplateRows: 'repeat(2, 1fr)',
                  gap: 10,
                  flex: 1,
                  maxHeight: 340,
                }
              : { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }
          }
        >
          {(['winter', 'spring', 'summer', 'fall'] as Season[]).map((s) => {
            const active = season === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSeasonChange(s)}
                style={{
                  padding: centerBoxes ? '18px 8px' : '12px 6px',
                  textAlign: 'center',
                  borderRadius: 10,
                  background: active ? `rgba(${glowRgb}, 0.12)` : ae.surface,
                  border: `0.5px solid ${active ? `rgba(${glowRgb}, 0.30)` : ae.line}`,
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                  ...(centerBoxes
                    ? {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }
                    : {}),
                }}
              >
                <div
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: centerBoxes ? 12 : 10,
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
                    marginTop: centerBoxes ? 0 : 4,
                    fontFamily: ae.fontDisplay,
                    fontSize: centerBoxes ? 24 : 16,
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
          caption="How green the plants are right now versus their normal level for this month. Below normal means drier, sparser vegetation, which raises risk."
          onChange={onNdviChange}
          footer={ndviFooter}
          isLoading={isLoading}
        />
      )}
      </div>

      {/* Backup-estimate callout — only in season mode, dismissible via the × */}
      {mode === 'season' && !dismissed ? (
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
            <span style={{ color: AMBER, fontWeight: 600 }}>Backup estimate. </span>
            Normally Status measures how dry the plants are from satellite imagery. When clouds block the view, it estimates from the time of year instead, which is what you&apos;re adjusting here.
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              marginTop: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: ae.textMute,
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = ae.text;
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ae.textMute;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Icon name="x" size={12} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

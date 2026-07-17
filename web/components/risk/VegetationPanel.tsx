'use client';

// Vegetation Signal panel — left half of the inputs row pair with Drought.
// "Season proxy" mode shows the 4 season buttons with their multipliers.
// "Vegetation (NDVI)" mode swaps in an NDVI anomaly slider [-0.30..+0.30].

import { useState, type ReactNode } from 'react';

import { BackupEstimateCallout } from '@/components/risk/BackupEstimateCallout';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { InputPanel } from '@/components/risk/InputPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { Season } from '@/lib/api';
import { SEASON_MULT } from '@/lib/v4-weights';

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
          glowRgb={glowRgb}
          size="sm"
        />
      </div>

      <div style={centerBoxes ? { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
      {mode === 'season' && isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
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

      {/* Backup-estimate callout — only in season mode, dismissible via the ×.
       *  Shares the component with DroughtPanel. */}
      {mode === 'season' && !dismissed ? (
        <BackupEstimateCallout
          onDismiss={() => setDismissed(true)}
          body="Normally Status measures how dry the plants are from satellite imagery. When clouds block the view, it estimates from the time of year instead, which is what you're adjusting here."
        />
      ) : null}
    </div>
  );
}

'use client';

// Drought Signal panel — mirrors VegetationPanel's structure. Mode toggle at
// the top, then either the KBDI slider (0-800) or the Days Since Rain slider
// (0-30). The backend accepts either: when `kbdi` is provided it wins, and
// the request omits kbdi for the days-only path so the algorithm falls back
// to the days_since_rain exponential proxy.
//
// Both modes auto-seed from the same upstream (Open-Meteo Archive). When the
// fetch fails, the parent passes a footer warning that applies to whichever
// mode is active.

import { useState, type ReactNode } from 'react';

import { BackupEstimateCallout } from '@/components/risk/BackupEstimateCallout';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { InputPanel } from '@/components/risk/InputPanel';
import { useAesthetic } from '@/lib/aesthetic';

export type DroughtMode = 'kbdi' | 'days';

export function DroughtPanel({
  mode,
  onModeChange,
  kbdi,
  onKbdiChange,
  daysSinceRain,
  onDaysChange,
  color,
  glowRgb,
  isLoading = false,
  footer,
}: {
  mode: DroughtMode;
  onModeChange: (m: DroughtMode) => void;
  kbdi: number;
  onKbdiChange: (n: number) => void;
  daysSinceRain: number;
  onDaysChange: (n: number) => void;
  color: string;
  glowRgb: string;
  isLoading?: boolean;
  /** Warning rendered inside the active mode's InputPanel when local data
   *  is unavailable (e.g. Open-Meteo Archive fetch failed). Shared across
   *  modes because both signals derive from the same upstream. */
  footer?: ReactNode;
}) {
  const { ae } = useAesthetic();
  const [dismissed, setDismissed] = useState(false);
  // Once the callout is dismissed in days mode, center the slider in the
  // freed-up vertical space instead of leaving a gap at the bottom.
  const centerContent = mode === 'days' && dismissed;

  return (
    <div
      className="ember-card"
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
          gap: 12,
        }}
      >
        <Eyebrow>Drought Signal</Eyebrow>
        <GlassSegmented<DroughtMode>
          value={mode}
          options={[
            { id: 'kbdi', label: 'KBDI' },
            { id: 'days', label: 'Days since rain' },
          ]}
          onChange={onModeChange}
          glowRgb={glowRgb}
          size="sm"
        />
      </div>

      <div style={centerContent ? { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}>
      {mode === 'kbdi' ? (
        <InputPanel
          label="Drought (KBDI)"
          value={kbdi}
          unit=""
          min={0}
          max={800}
          color={color}
          glowRgb={glowRgb}
          index={4}
          caption="Keetch-Byram Drought Index, 0-800. Higher means drier soil and fuels."
          onChange={onKbdiChange}
          isLoading={isLoading}
          footer={footer}
        />
      ) : (
        <InputPanel
          label="Days Since Rain"
          value={daysSinceRain}
          unit=""
          min={0}
          max={30}
          color={color}
          glowRgb={glowRgb}
          index={4}
          caption="Days since the last real rainfall. Used to gauge how dry light fuels (grass, leaves) are when a drought index isn't available."
          onChange={onDaysChange}
          isLoading={isLoading}
          footer={footer}
        />
      )}
      </div>

      {/* Mode explainer — only shown in days mode since KBDI is the canonical
       *  drought input. Shares the dismissible backup-estimate callout with
       *  VegetationPanel. */}
      {mode === 'days' && !dismissed ? (
        <BackupEstimateCallout
          onDismiss={() => setDismissed(true)}
          body="Normally Status pulls a full drought index from recent weather data. When that's unavailable, it estimates dryness from days since rain instead, which is what you're adjusting here."
        />
      ) : null}
    </div>
  );
}

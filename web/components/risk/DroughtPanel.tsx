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

import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { Icon } from '@/components/Icon';
import { InputPanel } from '@/components/risk/InputPanel';
import { useAesthetic } from '@/lib/aesthetic';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

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
          color={color}
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
          caption="Keetch-Byram Drought Index, 0–800. Higher = drier soil + fuels."
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
       *  drought input. Mirrors VegetationPanel's backup-estimate callout, and
       *  is dismissible via the × for the same reason. */}
      {mode === 'days' && !dismissed ? (
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
            Normally Status pulls a full drought index from recent weather data. When that&apos;s
            unavailable, it estimates dryness from days since rain instead, which is what you&apos;re
            adjusting here.
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

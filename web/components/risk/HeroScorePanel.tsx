'use client';

// The big score panel on the left of the Risk hero.
// Region selector → giant animated 0.44 → ScoreGauge → threshold labels → "Risk Level: X" pill.

import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ScoreGauge } from '@/components/risk/ScoreGauge';
import {
  FITTED_STATES,
  StatePickerModal,
} from '@/components/risk/StatePickerModal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds } from '@/lib/api';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

/** null = Global (no state calibration). Otherwise 2-letter US state code. */
export type RegionCode = string | null;

function regionName(code: RegionCode): string {
  if (code == null) return 'Global';
  return FITTED_STATES.find((s) => s.code === code)?.name ?? code;
}

export function HeroScorePanel({
  score,
  level,
  region,
  onRegionChange,
  thresholds,
}: {
  score: number;
  level: RiskLevel;
  region: RegionCode;
  onRegionChange: (r: RegionCode) => void;
  thresholds: RegionalThresholds | null;
}) {
  const { ae, accent } = useAesthetic();
  const [pickerOpen, setPickerOpen] = useState(false);
  const sr = getRisk(level, accent);
  // V4 backend bucketing: LOW < thresholds.low (50th pct), MOD < moderate
  // (75th), HIGH < extreme (97th), EXTREME ≥ extreme. The `high` field
  // (90th pct) is informational only — don't use it as a band boundary.
  // Defaults are the V4 global cutoffs from api/core/risk_algorithm.py.
  const th = {
    low: thresholds?.low ?? 0.3,
    moderate: thresholds?.moderate ?? 0.6,
    extreme: thresholds?.extreme ?? 0.8,
  };

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${sr.glow}, 0.25)`,
        borderRadius: ae.radiusLg,
        padding: 32,
        boxShadow: `0 30px 80px rgba(${sr.glow}, 0.12), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Subtle radial bloom */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          height: 280,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, rgba(${sr.glow}, 0.22), transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      <div style={{ position: 'relative' }}>
        {/* Header row: title + region selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: ae.fontDisplay,
                fontSize: 36,
                fontWeight: ae.titleWeight,
                letterSpacing: '-0.025em',
                color: ae.text,
                lineHeight: 1,
              }}
            >
              What-If Risk Score
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                maxWidth: 360,
                fontFamily: ae.fontBody,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: ae.textDim,
              }}
            >
              Tweak conditions below; the score is recomputed using the same algorithm the Status tab uses.
            </p>
          </div>
          {/* Region dropdown trigger — opens modal with all 17 + Global. */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              flexShrink: 0,
              padding: '8px 12px',
              borderRadius: 10,
              border: ae.cardBorder,
              background: ae.surface,
              color: ae.text,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              minWidth: 140,
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 9,
                  fontWeight: 600,
                  color: ae.textMute,
                  letterSpacing: '0.14em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                Calibrated for
              </span>
              <span
                style={{
                  marginTop: 2,
                  fontFamily: ae.fontDisplay,
                  fontSize: 13,
                  fontWeight: 600,
                  color: ae.text,
                  letterSpacing: ae.titleTracking,
                }}
              >
                {regionName(region)}
              </span>
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Icon name="caret" size={14} color={ae.textMute} strokeWidth={1.6} />
            </span>
          </button>
        </div>

        {/* Giant score */}
        <div
          style={{
            marginTop: 28,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            fontFamily: ae.fontDisplay,
            fontSize: 136,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.055em',
            color: ae.text,
            lineHeight: 0.9,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ textShadow: `0 0 40px rgba(${sr.glow}, 0.3)` }}>
            <AnimatedNumber value={score} format={(n) => n.toFixed(2)} duration={700} />
          </span>
        </div>

        <div style={{ marginTop: 14 }}>
          <ScoreGauge score={score} thresholds={th} />
        </div>

        {/* Threshold labels */}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            color: ae.textMute,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          <span style={{ color: level === 'low' ? RISK_LEVELS.low.color : undefined }}>
            Low &lt;{th.low.toFixed(2)}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: level === 'moderate' ? RISK_LEVELS.moderate.color : undefined }}>
            Mod &lt;{th.moderate.toFixed(2)}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: level === 'high' ? getRisk('high', accent).color : undefined }}>
            High &lt;{th.extreme.toFixed(2)}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: level === 'extreme' ? sr.color : undefined }}>
            Ext ≥{th.extreme.toFixed(2)}
          </span>
        </div>

        {/* Risk Level pill */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              padding: '14px 26px',
              borderRadius: 99,
              background: `radial-gradient(ellipse at center, rgba(${sr.glow}, 0.18), rgba(${sr.glow}, 0.04))`,
              border: `1px solid ${sr.color}`,
              boxShadow: `0 0 32px rgba(${sr.glow}, 0.55), inset 0 0 16px rgba(${sr.glow}, 0.10)`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              animation: 'ember-flicker 2.5s ease-in-out infinite',
            }}
          >
            <svg width="20" height="22" viewBox="0 0 22 24" fill="none" aria-hidden="true">
              <path
                d="M11 1l9 3v8c0 6-5 10-9 11-4-1-9-5-9-11V4l9-3z"
                fill={`rgba(${sr.glow}, 0.06)`}
                stroke={sr.color}
                strokeWidth="1.3"
              />
              <path
                d="M7 6l2 4M11 5l2 6M15 5l1 4"
                stroke={sr.color}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 13,
                color: sr.color,
                letterSpacing: '0.22em',
                fontWeight: 700,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Risk Level: {RISK_LEVELS[level].label}
            </span>
          </div>
        </div>
      </div>

      <StatePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={region}
        onChange={onRegionChange}
      />
    </div>
  );
}

// Re-export so RiskScreen can still import region name from one place.
export { regionName };

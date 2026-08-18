'use client';

// What-If Risk Score hero — ported from mobile (app/(tabs)/risk.tsx). Two
// stacked blocks instead of one fused card:
//   1. Title block (above the card) — small amber dot, "What-If Risk Score"
//      headline, hairline divider, subtitle. No card chrome here.
//   2. Score card — premium-card chrome with grid texture + corner halo +
//      level-tinted border. Region picker (top-right), big animated score,
//      score gauge, threshold readout, "RISK LEVEL: X" pill.
//
// Ambient chrome is floored at 'moderate' so low-risk pages don't read as
// washed-out teal — the literal label/pill still shows the actual level.

import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { CalibrationLadder } from '@/components/status/CalibrationLadder';
import { Modal } from '@/components/ui/Modal';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { GLOBAL_THRESHOLDS, ScoreGauge } from '@/components/risk/ScoreGauge';
import {
  FITTED_STATES,
  StatePickerModal,
} from '@/components/risk/StatePickerModal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds } from '@/lib/api';
import { CALIBRATION_INFO } from '@/lib/regional-thresholds';
import { floorLow, getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

const AMBER = RISK_LEVELS.moderate.color;

/** null = Global (no state calibration). Otherwise 2-letter US state code. */
export type RegionCode = string | null;

export function regionName(code: RegionCode): string {
  if (code == null) return 'Global';
  return FITTED_STATES.find((s) => s.code === code)?.name ?? code;
}

export function HeroScorePanel({
  score,
  level,
  region,
  onRegionChange,
  thresholds,
  isLoading = false,
}: {
  score: number;
  level: RiskLevel;
  region: RegionCode;
  onRegionChange: (r: RegionCode) => void;
  thresholds: RegionalThresholds | null;
  /** True during location-switch transitions — replaces the score number,
   *  gauge, threshold labels and pill with skeletons so the hero matches
   *  the slider tiles' loading rhythm. The title + region picker stay
   *  visible since they don't depend on the in-flight risk computation. */
  isLoading?: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ladderOpen, setLadderOpen] = useState(false);
  // Ambient chrome (border tint, top stripe, corner glow) is floored to
  // moderate when actual is low — matches the same convention used on Status
  // / Safety so low doesn't read as muted teal everywhere.
  const chromeLevel = floorLow(level);
  const cr = getRisk(chromeLevel, accent);
  // Pill tone uses the TRUE level so the label "Risk Level: LOW" displays
  // accurately in green when applicable, even though the card chrome is amber.
  const pillTone = getRisk(level, accent);
  // Fire-weather backend bucketing: LOW < thresholds.low (50th pct), MOD < moderate
  // (75th), HIGH < extreme (97th), EXTREME ≥ extreme. The `high` field
  // (90th pct) is informational only — don't use it as a band boundary.
  // Defaults are the fire-weather global cutoffs (shared GLOBAL_THRESHOLDS, from
  // api/core/risk_algorithm.py._bucket) used when the user isn't in a fitted
  // state and no per-state thresholds are supplied.
  const th = {
    low: thresholds?.low ?? GLOBAL_THRESHOLDS.low,
    moderate: thresholds?.moderate ?? GLOBAL_THRESHOLDS.moderate,
    extreme: thresholds?.extreme ?? GLOBAL_THRESHOLDS.extreme,
  };

  return (
    <div>
      {/* ─── Title block (above the card, centered) ──────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        {/* Amber accent dot — echoes the SectionEyebrow above and anchors
         *  the title to the page rather than letting it float. */}
        <div
          style={{
            margin: '0 auto',
            width: 5,
            height: 5,
            borderRadius: 99,
            background: AMBER,
            boxShadow: `0 0 6px ${AMBER}`,
          }}
        />
        <h1
          style={{
            margin: '10px 0 0',
            fontFamily: ae.fontDisplay,
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: ae.text,
            lineHeight: 1.05,
            textShadow: '0 0 8px rgba(255,255,255,0.06)',
          }}
        >
          Fire-Weather What-If
        </h1>
        {/* Hairline divider — short, centered, fading at edges. */}
        <div
          aria-hidden="true"
          style={{
            margin: '12px auto 0',
            width: 48,
            height: 1,
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
          }}
        />
        <p
          style={{
            margin: '12px auto 0',
            maxWidth: 460,
            fontFamily: ae.fontBody,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: ae.textDim,
            letterSpacing: '0.005em',
          }}
        >
          Change the conditions and watch the fire-weather score react. This is the
          fire-weather part of your <strong style={{ color: ae.text }}>overall risk</strong>. On the
          Status page it&apos;s combined with how likely a fire is to start and with any nearby active
          fires to set your final risk level.
        </p>
      </div>

      {/* ─── Score card ─────────────────────────────────────────────────── */}
      <div
        className="ember-card ember-hero-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${cr.glow}, 0.22)`,
          borderRadius: ae.radiusLg,
          padding: 24,
          // Drop-shadow + corner halo both lessened so the card reads as a
          // confident hero artifact rather than glowing like a UI button.
          boxShadow: `0 18px 48px rgba(${cr.glow}, 0.08)`,
          ['--card-accent' as string]: cr.color,
          ['--card-accent-soft' as string]: `rgba(${cr.glow}, 0.12)`,
        }}
      >
        {/* Grid texture — technical / measured feel, mirrors mobile's
         *  PremiumCard texture="grid". 4% opacity stays barely-there. */}
        <GridPattern opacity={0.04} />

        {/* Bottom-right corner halo — softer + wider than the default
         *  ember-hero-card top-right glow, matches mobile glowPosition="bottomRight".
         *  Alpha lessened from 0.22 → 0.12 so it reads as warmth, not a spotlight. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -80,
            right: -80,
            width: 260,
            height: 260,
            pointerEvents: 'none',
            background: `radial-gradient(circle at center, rgba(${cr.glow}, 0.12), transparent 70%)`,
            filter: 'blur(20px)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Region picker — top right inside the card */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
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
                minWidth: 150,
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

          {isLoading ? (
            <>
              {/* Score number skeleton — matches the 96px line height */}
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <Skeleton width={220} height={96} rounded="md" />
              </div>
              {/* Gauge bar skeleton */}
              <div style={{ marginTop: 18 }}>
                <Skeleton width="100%" height={16} rounded="full" />
              </div>
              {/* Threshold-label row skeleton */}
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} width={70} height={12} rounded="sm" />
                ))}
              </div>
              {/* Risk-level pill skeleton — same footprint as the real pill */}
              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
                <Skeleton width={240} height={52} rounded="full" />
              </div>
            </>
          ) : (
            <>
              {/* Giant score — centered, level-colored. ~96px (mobile uses 84;
               *  web has wider hero cells so a bit bigger reads better). */}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'center',
                  fontFamily: ae.fontDisplay,
                  fontSize: 96,
                  fontWeight: 800,
                  letterSpacing: '-0.055em',
                  color: pillTone.color,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: `0 0 28px rgba(${pillTone.glow}, 0.35)`,
                }}
              >
                <AnimatedNumber value={score} format={(n) => n.toFixed(2)} duration={700} />
              </div>

              <div style={{ marginTop: 18 }}>
                <ScoreGauge score={score} thresholds={th} />
              </div>

              {/* Threshold labels */}
              <div
                style={{
                  marginTop: 14,
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
                <span style={{ color: level === 'extreme' ? getRisk('extreme', accent).color : undefined }}>
                  Ext ≥{th.extreme.toFixed(2)}
                </span>
              </div>

              {/* "See across all states" trigger — opens the calibration
               *  ladder modal driven by the current slider-driven score.
               *  Reuses the same CalibrationLadder component the Status
               *  hero uses; reinforces the calibration story for users
               *  experimenting with the what-if sliders. */}
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setLadderOpen(true)}
                  aria-label="See this score across all 17 fitted states"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: ae.textMute,
                    fontFamily: ae.fontMono,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  See this score across all states
                  <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
                </button>
              </div>

              {/* Risk Level pill — keeps actual level color so "Low" stays green */}
              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    padding: '14px 26px',
                    borderRadius: 99,
                    background: `radial-gradient(ellipse at center, rgba(${pillTone.glow}, 0.18), rgba(${pillTone.glow}, 0.04))`,
                    border: `1px solid ${pillTone.color}`,
                    boxShadow: `0 0 32px rgba(${pillTone.glow}, 0.55), inset 0 0 16px rgba(${pillTone.glow}, 0.10)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    animation: 'ember-flicker 2.5s ease-in-out infinite',
                  }}
                >
                  <svg width="20" height="22" viewBox="0 0 22 24" fill="none" aria-hidden="true">
                    <path
                      d="M11 1l9 3v8c0 6-5 10-9 11-4-1-9-5-9-11V4l9-3z"
                      fill={`rgba(${pillTone.glow}, 0.06)`}
                      stroke={pillTone.color}
                      strokeWidth="1.3"
                    />
                    <path
                      d="M7 6l2 4M11 5l2 6M15 5l1 4"
                      stroke={pillTone.color}
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 13,
                      color: pillTone.color,
                      letterSpacing: '0.22em',
                      fontWeight: 700,
                      textTransform: ae.chipUpper ? 'uppercase' : 'none',
                    }}
                  >
                    Risk Level: {RISK_LEVELS[level].label}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <StatePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={region}
        onChange={onRegionChange}
      />

      {/* Calibration ladder — uses the picked region as the user's state.
       *  When region is null (Global), the ladder's per-row tier-at-score
       *  column still works but no row gets the "your state" highlight;
       *  the user can still see how their slider score buckets across all
       *  17 states. */}
      <Modal
        open={ladderOpen}
        onClose={() => setLadderOpen(false)}
        eyebrow="Calibration"
        title="This score across all 17 states"
        maxWidth={620}
      >
        <p
          style={{
            margin: 0,
            fontFamily: ae.fontBody,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: ae.textDim,
          }}
        >
          Your slider-driven score is{' '}
          <strong style={{ color: ae.text, fontFamily: ae.fontMono }}>
            {score.toFixed(2)}
          </strong>
          . Below, that same number is bucketed against each fitted state&apos;s historical
          fire-day distribution. The right-side column shows which tier your score would land
          in for that state.
        </p>
        <div style={{ marginTop: 18 }}>
          {/* Calibration data is bundled (web/lib/regional-thresholds.ts), so
              the ladder renders instantly and works fully offline — no
              /risk/calibration fetch, no loading state. */}
          <CalibrationLadder
            data={CALIBRATION_INFO}
            userState={region}
            userScore={score}
            liveLocation={false}
          />
        </div>
      </Modal>
    </div>
  );
}

'use client';

// 2D phase-space visualization — opens from the Trajectory chip on Status.
// Two-axis plot: weather (W) on x, active-fire threat (T) on y. The
// background is tier-shaded using the same COMPOSITE_MATRIX that drives
// the headline tier on Status. The user's CURRENT position is a glowing
// dot; their PROJECTED +6hr position is a second dot with an arrow
// between them showing where conditions are heading.
//
// What makes phase-space net-new vs the matrix grid (which shows
// categorical W×T cells): here the user has a CONTINUOUS position, and
// the projection arrow shows TIME EVOLUTION — exactly the dimension
// the matrix grid can't represent. This was the user's own concern
// when we discussed Tier 2 #8 alone, and adding trajectory is what
// makes it valuable.

import { useMemo } from 'react';

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import type { TrajectoryResponse, TrajectoryTier } from '@/lib/api';
import {
  bucketOf,
  compositeFromBuckets,
} from '@/lib/composite-risk';
import type { RegionalThresholds } from '@/lib/api';
import { type RiskLevel } from '@/lib/theme';

const TIER_TONE: Record<TrajectoryTier, { color: string; rgb: string; label: string }> = {
  rising:  { color: '#FF7A3A', rgb: '255, 122, 58',  label: 'Rising' },
  steady:  { color: '#9ca3af', rgb: '156, 163, 175', label: 'Steady' },
  falling: { color: '#3FB68B', rgb: '63, 182, 139',  label: 'Falling' },
};

const TIER_SHORT: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MOD',
  high: 'HIGH',
  extreme: 'EXT',
};

// Plot inset coordinates — the actual data area inside the SVG. The
// background tier regions and the axis labels live in the outer SVG
// frame; data points are placed in this inner box.
// Bottom + left have extra room for the two-row axis labels (numeric
// ticks + tier badges) and the axis titles below/beside them.
const PLOT_INSET = { top: 30, right: 30, bottom: 68, left: 80 };

export function PhaseSpaceModal({
  open,
  onClose,
  threatSignal,
  weatherBucket,
  threatBucket,
  trajectory,
  regionalThresholds,
}: {
  open: boolean;
  onClose: () => void;
  /** Current aggregate threat score (0-1, from aggregateThreat). Null
   *  when compositeReady is false. Held constant across the 6-hr horizon
   *  since this version doesn't forecast active-fire movement. */
  threatSignal: number | null;
  /** Current weather tier (for the tier-crossing notice below the plot). */
  weatherBucket: RiskLevel | null;
  /** Current threat tier; null = no fire in range. */
  threatBucket: RiskLevel | null;
  /** Forward-looking projection from /trajectory; null when upstream failed.
   *  ALL displayed values in this modal — frame tiles, dot positions, V4
   *  scores — come from this object, so the trajectory math is internally
   *  consistent: the inputs you see, the delta you see, and the projection
   *  arrow all reference the same Open-Meteo data. The modal's "Now" V4
   *  may differ slightly from Status's Fire Weather card (Status uses
   *  OpenWeatherMap's current observation; trajectory uses Open-Meteo's
   *  current observation) — small mismatch flagged in the modal copy. */
  trajectory: TrajectoryResponse | null | undefined;
  /** Per-state regional thresholds — used to draw tier-boundary gridlines
   *  on the W axis at the user's calibrated cutoffs. Null → fall back to
   *  global 0.3/0.6/0.8 for the gridlines (matches normalizeWeather's
   *  global fallback). */
  regionalThresholds: RegionalThresholds | null;
}) {
  const { ae } = useAesthetic();

  // Both dots and both frame tiles use the trajectory's own frame data —
  // internally consistent, so the visible inputs always add up to the
  // visible delta. The trade-off (modal's V4 may differ from Status's V4
  // by a few percent) is acknowledged in the data-source note below.
  const nowRawScore = trajectory?.now.v4_score ?? null;
  const projectedRawScore = trajectory?.projected.v4_score ?? null;

  // Projected weather tier — used for the tier-crossing callout below
  // the plot. bucketOf works on raw V4 here because it's a quartile
  // lookup; for strict W tier we'd want regional-percentile bucketing,
  // but for the "is the tier shifting?" UX question, the quartile
  // bucketOf is close enough as a directional indicator.
  const projectedWeatherBucket = useMemo(() => {
    if (projectedRawScore == null) return null;
    return bucketOf(projectedRawScore);
  }, [projectedRawScore]);

  const projectedComposite = useMemo(() => {
    if (projectedWeatherBucket == null) return null;
    return compositeFromBuckets(projectedWeatherBucket, threatBucket);
  }, [projectedWeatherBucket, threatBucket]);

  const currentComposite = useMemo(
    () => compositeFromBuckets(weatherBucket, threatBucket),
    [weatherBucket, threatBucket],
  );

  return (
    <Modal open={open} onClose={onClose} eyebrow="Phase Space" title="Where you are, where you're heading" maxWidth={720}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: ae.textDim,
        }}
      >
        Two-axis plot of the composite inputs on a raw <strong style={{ color: ae.text }}>0–1
        scale</strong>. <strong style={{ color: ae.text }}>Weather</strong> (V4 fire-weather
        score) runs left → right; <strong style={{ color: ae.text }}>active-fire threat</strong>{' '}
        runs bottom → top. Tier boundaries are shown as faint dashed lines at your state&apos;s
        calibrated cutoffs (W) and the fixed 0.25 / 0.5 / 0.75 quartiles (T). Bright dot is
        your current position; dimmer dot is where the next 6 hours of forecast weather
        projects you, with the same threat score held constant.
      </p>
      <p
        style={{
          margin: '10px 0 0',
          fontFamily: ae.fontBody,
          fontSize: 11.5,
          lineHeight: 1.5,
          color: ae.textMute,
          fontStyle: 'italic',
        }}
      >
        Trajectory data comes from Open-Meteo&apos;s hourly forecast. The Now V4 here may
        differ by a few hundredths from Status&apos;s Fire Weather card, which uses
        OpenWeatherMap&apos;s real-time station observation — both are estimates of current
        conditions with different upstream cadences. The trajectory tier itself reflects
        Open-Meteo&apos;s internal now-vs-projected delta.
      </p>

      <div style={{ marginTop: 18 }}>
        <PhaseSpacePlot
          ae={ae}
          weatherRawScore={nowRawScore}
          threatSignal={threatSignal}
          projectedWeatherRawScore={projectedRawScore}
          trajectoryTier={trajectory?.tier ?? null}
          regionalThresholds={regionalThresholds}
        />
      </div>

      {/* Trajectory summary line + projected-tier callout */}
      {trajectory ? (
        <TrajectorySummary
          ae={ae}
          trajectory={trajectory}
          currentComposite={currentComposite}
          projectedComposite={projectedComposite}
        />
      ) : (
        <p
          style={{
            marginTop: 16,
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            color: ae.textMute,
            lineHeight: 1.5,
          }}
        >
          Trajectory data unavailable right now — the static position is still accurate.
        </p>
      )}
    </Modal>
  );
}

// ─── The SVG plot ────────────────────────────────────────────────────────

function PhaseSpacePlot({
  ae,
  weatherRawScore,
  threatSignal,
  projectedWeatherRawScore,
  trajectoryTier,
  regionalThresholds,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  weatherRawScore: number | null;
  threatSignal: number | null;
  projectedWeatherRawScore: number | null;
  trajectoryTier: TrajectoryTier | null;
  regionalThresholds: RegionalThresholds | null;
}) {
  const width = 640;
  const height = 380;
  const inner = {
    x0: PLOT_INSET.left,
    y0: PLOT_INSET.top,
    x1: width - PLOT_INSET.right,
    y1: height - PLOT_INSET.bottom,
  };
  const innerW = inner.x1 - inner.x0;
  const innerH = inner.y1 - inner.y0;

  // Helper: map a 0-1 coord to pixel-x/pixel-y. Y is INVERTED (high T
  // visually UP, so high data-y maps to low SVG-y).
  const toX = (w: number) => inner.x0 + Math.max(0, Math.min(1, w)) * innerW;
  const toY = (t: number) => inner.y1 - Math.max(0, Math.min(1, t)) * innerH;

  // W axis tier boundaries — calibrated per state when regionalThresholds
  // is available; falls back to the global cutoffs (0.3 / 0.6 / 0.8) when
  // the user is outside the 17 fitted states. These mirror the boundaries
  // backend `_bucket` uses to assign tiers from raw V4 scores.
  const wBounds = {
    low: regionalThresholds?.low ?? 0.3,
    moderate: regionalThresholds?.moderate ?? 0.6,
    extreme: regionalThresholds?.extreme ?? 0.8,
  };

  // T axis tier boundaries — fixed at 0.25/0.5/0.75 since threat is
  // bucketOf'd through fixed quartiles regardless of region.
  const tBounds = { low: 0.25, moderate: 0.5, high: 0.75 };

  // Current position — raw scores directly on the 0-1 axes per user
  // request, no normalization.
  const hasCurrent = weatherRawScore != null && threatSignal != null;
  const curX = hasCurrent ? toX(weatherRawScore!) : null;
  const curY = hasCurrent ? toY(threatSignal!) : null;

  // Projected position — only the weather axis moves; threat held constant
  // because forecasts for active fires aren't in this version.
  const hasProjected = projectedWeatherRawScore != null && threatSignal != null;
  const projX = hasProjected ? toX(projectedWeatherRawScore!) : null;
  const projY = hasProjected ? toY(threatSignal!) : null;

  const trajectoryColor = trajectoryTier
    ? TIER_TONE[trajectoryTier].color
    : ae.textMute;
  const trajectoryRgb = trajectoryTier
    ? TIER_TONE[trajectoryTier].rgb
    : '156, 163, 175';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: '100%',
        height: 'auto',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        borderRadius: 14,
        border: `0.5px solid ${ae.line}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      role="img"
      aria-label="Phase-space plot of weather × active-fire threat"
    >
      <defs>
        {/* Continuous diagonal risk gradient — bottom-left (safe / green)
            to top-right (extreme / red), routed through amber and orange.
            This is the visual heart of the plot: position alone tells the
            story, no need to read tier labels. The risk SURFACE is
            continuous; the discrete matrix tiers from COMPOSITE_MATRIX
            are overlaid as subtle contour guides rather than hard cells.
            x1=0,y1=100% to x2=100%,y2=0 means bottom-left to top-right. */}
        <linearGradient id="risk-surface" x1="0" y1="100%" x2="100%" y2="0">
          <stop offset="0%"   stopColor="#3FB68B" stopOpacity="0.04" />
          <stop offset="22%"  stopColor="#3FB68B" stopOpacity="0.22" />
          <stop offset="48%"  stopColor="#E8B339" stopOpacity="0.28" />
          <stop offset="72%"  stopColor="#FF7A3A" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#F04438" stopOpacity="0.42" />
        </linearGradient>

        {/* Top-right corner glow — adds depth to the EXT region without
            saturating the whole quadrant. Radial centered slightly outside
            the plot so only the inner edge bleeds in. */}
        <radialGradient
          id="ext-glow"
          cx="100%"
          cy="0%"
          r="65%"
          fx="100%"
          fy="0%"
        >
          <stop offset="0%"   stopColor="#F04438" stopOpacity="0.28" />
          <stop offset="60%"  stopColor="#F04438" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#F04438" stopOpacity="0" />
        </radialGradient>

        {/* Bottom-left corner soft-glow — anchors the "safe" zone with a
            faint green that fades out before the diagonal. */}
        <radialGradient
          id="low-glow"
          cx="0%"
          cy="100%"
          r="50%"
          fx="0%"
          fy="100%"
        >
          <stop offset="0%"   stopColor="#3FB68B" stopOpacity="0.18" />
          <stop offset="60%"  stopColor="#3FB68B" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#3FB68B" stopOpacity="0" />
        </radialGradient>

        {/* Arrow marker — colored per trajectory tier */}
        <marker
          id="trajectory-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={trajectoryColor} />
        </marker>

        {/* Trajectory-arrow stroke gradient — fades from translucent at
            the now-side to fully saturated at the projected-side, hinting
            at directionality before you even read the labels. */}
        <linearGradient id="trajectory-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={trajectoryColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={trajectoryColor} stopOpacity="1" />
        </linearGradient>

        {/* Now-dot multi-layer halo gradient */}
        <radialGradient id="now-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ─── Continuous risk-surface backdrop ─────────────────────────
          One smooth gradient instead of 20 discrete tier cells. The
          discrete matrix lives in the "Why this score?" modal; here the
          job is to show CONTINUOUS POSITION + DIRECTION. */}
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="url(#risk-surface)"
      />
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="url(#low-glow)"
      />
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="url(#ext-glow)"
      />

      {/* W axis tier-boundary lines — placed at the user's state's
          calibrated thresholds (or the global 0.3/0.6/0.8 fallback).
          Subtle dashed lines so they read as guides not partitions. */}
      {[wBounds.low, wBounds.moderate, wBounds.extreme].map((b) => (
        <line
          key={`grid-w-${b}`}
          x1={toX(b)}
          y1={inner.y0}
          x2={toX(b)}
          y2={inner.y1}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="0.5"
          strokeDasharray="2,4"
        />
      ))}

      {/* T axis tier-boundary lines — fixed at 0.25/0.5/0.75 quartiles. */}
      {[tBounds.low, tBounds.moderate, tBounds.high].map((b) => (
        <line
          key={`grid-t-${b}`}
          x1={inner.x0}
          y1={toY(b)}
          x2={inner.x1}
          y2={toY(b)}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="0.5"
          strokeDasharray="2,4"
        />
      ))}

      {/* Plot frame border — subtle inner-border so the gradient stops
          cleanly at the data area. */}
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.5"
      />

      {/* Axis labels — numeric tick values + tier-name badges. */}
      <g
        style={{
          fontFamily: ae.fontMono,
          fill: ae.textMute,
        }}
      >
        {/* X axis numeric ticks — at 0, calibrated thresholds, and 1. */}
        {[
          { v: 0.0, lbl: '0.00' },
          { v: wBounds.low,      lbl: wBounds.low.toFixed(2) },
          { v: wBounds.moderate, lbl: wBounds.moderate.toFixed(2) },
          { v: wBounds.extreme,  lbl: wBounds.extreme.toFixed(2) },
          { v: 1.0, lbl: '1.00' },
        ].map((tick) => (
          <text
            key={`xtick-${tick.v}`}
            x={toX(tick.v)}
            y={inner.y1 + 14}
            textAnchor="middle"
            fontSize="9"
            fontWeight={600}
            letterSpacing="0.04em"
            fill={ae.textDim}
          >
            {tick.lbl}
          </text>
        ))}

        {/* X axis tier-name badges — small uppercase labels centered in
            each W tier band. */}
        {(['LOW', 'MOD', 'HIGH', 'EXT'] as const).map((name, i) => {
          const lo = i === 0 ? 0 : [wBounds.low, wBounds.moderate, wBounds.extreme][i - 1];
          const hi = i < 3 ? [wBounds.low, wBounds.moderate, wBounds.extreme][i] : 1.0;
          return (
            <text
              key={`xtier-${name}`}
              x={toX((lo + hi) / 2)}
              y={inner.y1 + 28}
              textAnchor="middle"
              fontSize="9"
              fontWeight={700}
              letterSpacing="0.16em"
              fill={ae.textMute}
            >
              {name}
            </text>
          );
        })}

        <text
          x={(inner.x0 + inner.x1) / 2}
          y={inner.y1 + 46}
          textAnchor="middle"
          fontSize="10"
          fontWeight={700}
          letterSpacing="0.18em"
          fill={ae.text}
        >
          WEATHER (V4 SCORE) →
        </text>

        {/* Y axis numeric ticks — at 0, 0.25, 0.5, 0.75, 1.0. */}
        {[0.0, 0.25, 0.5, 0.75, 1.0].map((tick) => (
          <text
            key={`ytick-${tick}`}
            x={inner.x0 - 8}
            y={toY(tick) + 3}
            textAnchor="end"
            fontSize="9"
            fontWeight={600}
            letterSpacing="0.04em"
            fill={ae.textDim}
          >
            {tick.toFixed(2)}
          </text>
        ))}

        {/* Y axis tier-name badges — sit to the left of the numeric ticks. */}
        {(['LOW', 'MOD', 'HIGH', 'EXT'] as const).map((name, i) => {
          const lo = [0, 0.25, 0.5, 0.75][i];
          const hi = [0.25, 0.5, 0.75, 1.0][i];
          return (
            <text
              key={`ytier-${name}`}
              x={inner.x0 - 34}
              y={toY((lo + hi) / 2) + 3}
              textAnchor="end"
              fontSize="9"
              fontWeight={700}
              letterSpacing="0.16em"
              fill={ae.textMute}
            >
              {name}
            </text>
          );
        })}

        <text
          transform={`rotate(-90 ${inner.x0 - 60} ${(inner.y0 + inner.y1) / 2})`}
          x={inner.x0 - 60}
          y={(inner.y0 + inner.y1) / 2}
          textAnchor="middle"
          fontSize="10"
          fontWeight={700}
          letterSpacing="0.18em"
          fill={ae.text}
        >
          ↑ ACTIVE FIRE THREAT
        </text>
      </g>

      {/* Trajectory arrow (current → projected) — gradient stroke fades
          from translucent at the now-side to fully saturated at the
          projected-side, hinting at direction before you read the labels.
          Animated dash gives a subtle motion cue. */}
      {hasCurrent && hasProjected && curX != null && curY != null && projX != null && projY != null && trajectoryTier ? (
        <g>
          {/* Outer soft glow stroke under the main line */}
          <line
            x1={curX}
            y1={curY}
            x2={projX}
            y2={projY}
            stroke={trajectoryColor}
            strokeWidth="6"
            strokeOpacity="0.22"
            strokeLinecap="round"
          />
          {/* Main gradient-stroked arrow */}
          <line
            x1={curX}
            y1={curY}
            x2={projX}
            y2={projY}
            stroke="url(#trajectory-stroke)"
            strokeWidth="2.5"
            strokeLinecap="round"
            markerEnd="url(#trajectory-arrow)"
            style={{
              filter: `drop-shadow(0 0 8px rgba(${trajectoryRgb}, 0.75))`,
            }}
          />
        </g>
      ) : null}

      {/* Projected position dot */}
      {hasProjected && projX != null && projY != null ? (
        <g>
          <circle
            cx={projX}
            cy={projY}
            r="11"
            fill={`rgba(${trajectoryRgb}, 0.10)`}
            stroke={trajectoryColor}
            strokeOpacity="0.55"
            strokeWidth="1"
            strokeDasharray="3,2.5"
          />
          <circle
            cx={projX}
            cy={projY}
            r="4"
            fill={trajectoryColor}
            fillOpacity="0.85"
            style={{
              filter: `drop-shadow(0 0 8px rgba(${trajectoryRgb}, 0.75))`,
            }}
          />
          <text
            x={projX + 16}
            y={projY - 6}
            fontFamily={ae.fontMono}
            fontSize="9.5"
            fontWeight={700}
            letterSpacing="0.16em"
            fill={trajectoryColor}
            style={{ textShadow: `0 0 6px rgba(${trajectoryRgb}, 0.45)` }}
          >
            +6 HR
          </text>
        </g>
      ) : null}

      {/* Current position dot — drawn last so it sits on top of the
          arrow + projected dot. Multi-layer glow for prominence. */}
      {hasCurrent && curX != null && curY != null ? (
        <g>
          {/* Outermost soft halo via gradient */}
          <circle cx={curX} cy={curY} r="28" fill="url(#now-halo)" />
          {/* Mid-ring outline */}
          <circle
            cx={curX}
            cy={curY}
            r="13"
            fill="none"
            stroke="rgba(255,255,255,0.32)"
            strokeWidth="0.75"
          />
          {/* Inner accent ring */}
          <circle
            cx={curX}
            cy={curY}
            r="9"
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.6"
          />
          {/* Bright core */}
          <circle
            cx={curX}
            cy={curY}
            r="5.5"
            fill="#fff"
            style={{
              filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.85))',
            }}
          />
          <text
            x={curX + 16}
            y={curY + 5}
            fontFamily={ae.fontMono}
            fontSize="10"
            fontWeight={800}
            letterSpacing="0.16em"
            fill="#fff"
            style={{ textShadow: '0 0 8px rgba(255,255,255,0.55)' }}
          >
            NOW
          </text>
        </g>
      ) : null}
    </svg>
  );
}

// ─── Below-plot summary ──────────────────────────────────────────────────

function TrajectorySummary({
  ae,
  trajectory,
  currentComposite,
  projectedComposite,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  trajectory: TrajectoryResponse;
  currentComposite: RiskLevel | null;
  projectedComposite: RiskLevel | null;
}) {
  const tone = TIER_TONE[trajectory.tier];
  const willCrossTier =
    currentComposite != null &&
    projectedComposite != null &&
    currentComposite !== projectedComposite;

  const driverLabel = {
    vpd: 'vapor pressure deficit',
    wind: 'wind',
    humidity: 'humidity',
  }[trajectory.dominant_driver];

  const horizon = trajectory.horizon_hours;
  const deltaSign = trajectory.delta_pct > 0 ? '+' : '';
  const deltaText = `${deltaSign}${trajectory.delta_pct.toFixed(1)}%`;

  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Headline trajectory callout */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: `linear-gradient(180deg, rgba(${tone.rgb}, 0.14), rgba(${tone.rgb}, 0.04))`,
          border: `0.5px solid rgba(${tone.rgb}, 0.42)`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 8,
            height: 38,
            borderRadius: 6,
            background: tone.color,
            boxShadow: `0 0 10px ${tone.color}`,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: ae.textMute,
              textTransform: 'uppercase',
            }}
          >
            Next {horizon} hours
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: ae.fontDisplay,
              fontSize: 15,
              fontWeight: 700,
              color: ae.text,
              letterSpacing: '-0.01em',
            }}
          >
            <span style={{ color: tone.color }}>{tone.label}</span>{' '}
            <span style={{ color: ae.textMute, fontWeight: 500 }}>·</span>{' '}
            V4 score {deltaText}, driven by {driverLabel}
          </div>
        </div>
      </div>

      {/* Tier-crossing callout — only when projected tier differs from current */}
      {willCrossTier && currentComposite && projectedComposite ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${ae.line}`,
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            color: ae.textDim,
            lineHeight: 1.55,
          }}
        >
          Headline tier projected to shift from{' '}
          <strong style={{ color: ae.text, fontFamily: ae.fontMono, letterSpacing: '0.06em' }}>
            {TIER_SHORT[currentComposite]}
          </strong>{' '}
          →{' '}
          <strong style={{ color: ae.text, fontFamily: ae.fontMono, letterSpacing: '0.06em' }}>
            {TIER_SHORT[projectedComposite]}
          </strong>{' '}
          over the next {horizon} hours. The matrix cell you'll cross into is highlighted on the
          phase-space arrow's tip.
        </div>
      ) : null}

      {/* Forecast detail grid — both frames straight from the trajectory
          response so the inputs you see add up to the delta you see.
          Slight V4 mismatch with Status's Fire Weather card is flagged
          in the modal's data-source note above. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginTop: 4,
        }}
      >
        <FrameTile
          ae={ae}
          label="Now"
          tempC={trajectory.now.temperature_c}
          humidityPct={trajectory.now.humidity_pct}
          windKph={trajectory.now.wind_kph}
          v4Score={trajectory.now.v4_score}
        />
        <FrameTile
          ae={ae}
          label={`+${horizon} hr`}
          tempC={trajectory.projected.temperature_c}
          humidityPct={trajectory.projected.humidity_pct}
          windKph={trajectory.projected.wind_kph}
          v4Score={trajectory.projected.v4_score}
        />
      </div>
    </div>
  );
}

function FrameTile({
  ae,
  label,
  tempC,
  humidityPct,
  windKph,
  v4Score,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  tempC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  v4Score: number | null;
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 12,
          rowGap: 4,
          fontFamily: ae.fontMono,
          fontSize: 11,
          color: ae.textDim,
        }}
      >
        <span style={{ color: ae.textMute }}>Temp</span>
        <span style={{ color: ae.text }}>{tempC != null ? `${Math.round(tempC)}°C` : '—'}</span>
        <span style={{ color: ae.textMute }}>RH</span>
        <span style={{ color: ae.text }}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</span>
        <span style={{ color: ae.textMute }}>Wind</span>
        <span style={{ color: ae.text }}>{windKph != null ? `${Math.round(windKph)} kph` : '—'}</span>
        <span style={{ color: ae.textMute }}>V4 score</span>
        <span style={{ color: ae.text, fontWeight: 700 }}>{v4Score != null ? v4Score.toFixed(2) : '—'}</span>
      </div>
    </div>
  );
}


'use client';

// Fire-weather trajectory plot — opens from the Trajectory chip on Status.
// X axis = fire-weather (V4 score); Y axis = TIME (now at the bottom, +6 hr at
// the top). The vertical background bands are the COMPOSITE tier the user
// would be in at each weather level GIVEN their current active-fire threat
// (COMPOSITE_MATRIX row at the current threat bucket) — so a nearby fire
// visibly shifts the danger bands left, and the hour-by-hour forecast curve
// crossing a band edge is the moment your headline tier would change.
//
// Why this is net-new vs the "Why this score?" matrix grid: the matrix shows
// categorical cells; here you get a CONTINUOUS position evolving over time.
// The active-fire-threat axis used to be the Y axis but never moved across the
// 6-hour horizon (active fires aren't forecast), so time is the honest second
// axis and threat is folded into the band colors instead.
//
// Option B for the OWM/Open-Meteo "now" mismatch: the curve is anchored to the
// orb's current Status score (currentWeatherScore, from OpenWeatherMap) by
// scaling the Open-Meteo series so its first point lands there. Multiplicative
// scaling preserves the % deltas, so the curve stays consistent with the
// trajectory tier + delta. When the Status score is unavailable we fall back
// to the raw Open-Meteo series unchanged.

import { useMemo } from 'react';

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds, TrajectoryResponse, TrajectoryTier } from '@/lib/api';
import { formatSpeed, formatTemp, useUnits } from '@/lib/use-units';
import { bucketOf, compositeFromBuckets, normalizeWeather } from '@/lib/composite-risk';
import { RISK_LEVELS, type RiskLevel } from '@/lib/theme';

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

const W_TIERS: readonly RiskLevel[] = ['low', 'moderate', 'high', 'extreme'];

// Plot inset — left has room for the two-row weather-axis labels (numeric
// ticks + tier badges) and the rotated axis title; bottom has room for the
// time ticks + title.
const PLOT_INSET = { top: 26, right: 30, bottom: 52, left: 84 };

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function PhaseSpaceModal({
  open,
  onClose,
  weatherBucket,
  threatBucket,
  trajectory,
  regionalThresholds,
  currentWeatherScore,
  currentConditions,
}: {
  open: boolean;
  onClose: () => void;
  /** Current weather tier (from Status's regional calibration). Drives the
   *  current-composite readout + the tier-crossing callout. */
  weatherBucket: RiskLevel | null;
  /** Current active-fire threat tier; null = no fire in range. Selects which
   *  COMPOSITE_MATRIX row colors the background bands. */
  threatBucket: RiskLevel | null;
  /** Forward-looking projection from /trajectory; null when upstream failed. */
  trajectory: TrajectoryResponse | null | undefined;
  /** Per-state regional thresholds — tier-boundary gridlines on the W axis +
   *  consistent bucketing of the projected score. Null → global fallback. */
  regionalThresholds: RegionalThresholds | null;
  /** The raw V4 score behind the Status orb (OpenWeatherMap-derived). Used as
   *  the anchor for the trajectory curve so NOW matches the headline number. */
  currentWeatherScore: number | null;
  /** The user's current conditions from Status (OpenWeatherMap) — shown in the
   *  modal's "Now" tile so temp/RH/wind match the Status cards and the anchored
   *  NOW score (which is the OWM-derived Status score from these same inputs). */
  currentConditions: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKph: number | null;
  };
}) {
  const { ae } = useAesthetic();

  // ── Option B anchoring ──────────────────────────────────────────────────
  // Scale the Open-Meteo series so frames[0] lands on the orb's Status score.
  const frames = trajectory?.frames ?? [];
  const horizon = trajectory?.horizon_hours ?? (frames.length > 0 ? frames.length - 1 : 6);
  const anchorScale = useMemo(() => {
    const omNow = frames[0]?.v4_score;
    if (currentWeatherScore == null || omNow == null || omNow <= 0.01) return 1;
    return currentWeatherScore / omNow;
  }, [frames, currentWeatherScore]);
  const anchoredScores = useMemo(
    () => frames.map((f) => clamp01(f.v4_score * anchorScale)),
    [frames, anchorScale],
  );

  const anchoredNow = anchoredScores[0] ?? currentWeatherScore ?? null;
  const anchoredProjected =
    anchoredScores.length > 0 ? anchoredScores[anchoredScores.length - 1] : null;

  // Projected weather tier, bucketed the SAME way Status buckets the current
  // weather (normalize through the regional thresholds, then quartile bucket)
  // so the current-vs-projected tier comparison is apples-to-apples.
  const projectedWeatherBucket = useMemo<RiskLevel | null>(() => {
    if (anchoredProjected == null) return null;
    return bucketOf(normalizeWeather(anchoredProjected, regionalThresholds));
  }, [anchoredProjected, regionalThresholds]);

  const currentComposite = useMemo(
    () => compositeFromBuckets(weatherBucket, threatBucket),
    [weatherBucket, threatBucket],
  );
  const projectedComposite = useMemo(
    () => compositeFromBuckets(projectedWeatherBucket, threatBucket),
    [projectedWeatherBucket, threatBucket],
  );

  return (
    <Modal open={open} onClose={onClose} eyebrow="Trajectory" title="Where you are, where you're heading" maxWidth={720}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: ae.textDim,
        }}
      >
<strong style={{ color: ae.text }}>Time</strong> runs left (now) → right (+{horizon} hr); your{' '}
        <strong style={{ color: ae.text }}>fire-weather</strong> score runs bottom → top. The
        horizontal bands are the <strong style={{ color: ae.text }}>headline tier</strong> you&apos;d
        be in at each weather level given your current active-fire threat — so the hour the forecast
        curve rises into a higher band is the hour your tier would shift.
      </p>

      <div style={{ marginTop: 18 }}>
        <TrajectoryPlot
          ae={ae}
          anchoredScores={anchoredScores}
          horizon={horizon}
          currentScore={anchoredNow}
          trajectoryTier={trajectory?.tier ?? null}
          threatBucket={threatBucket}
          regionalThresholds={regionalThresholds}
        />
      </div>

      {trajectory ? (
        <TrajectorySummary
          ae={ae}
          trajectory={trajectory}
          anchoredNow={anchoredNow}
          anchoredProjected={anchoredProjected}
          currentComposite={currentComposite}
          projectedComposite={projectedComposite}
          currentConditions={currentConditions}
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
          Forecast trajectory unavailable right now — your current position (the bright dot) is
          still accurate.
        </p>
      )}
    </Modal>
  );
}

// ─── The SVG plot ────────────────────────────────────────────────────────

function TrajectoryPlot({
  ae,
  anchoredScores,
  horizon,
  currentScore,
  trajectoryTier,
  threatBucket,
  regionalThresholds,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  anchoredScores: number[];
  horizon: number;
  currentScore: number | null;
  trajectoryTier: TrajectoryTier | null;
  threatBucket: RiskLevel | null;
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

  // X = time fraction (0 = now → left, 1 = +horizon → right).
  // Y = weather score (0 → bottom, 1 → top).
  const toX = (t: number) => inner.x0 + clamp01(t) * innerW;
  const toY = (w: number) => inner.y1 - clamp01(w) * innerH;

  // Weather-axis tier boundaries — calibrated per state, else global 0.3/0.6/0.8.
  const wBounds = {
    low: regionalThresholds?.low ?? 0.3,
    moderate: regionalThresholds?.moderate ?? 0.6,
    extreme: regionalThresholds?.extreme ?? 0.8,
  };
  const bandEdges = [0, wBounds.low, wBounds.moderate, wBounds.extreme, 1];

  const tone = trajectoryTier ? TIER_TONE[trajectoryTier] : null;
  const lineColor = tone?.color ?? ae.textMute;
  const lineRgb = tone?.rgb ?? '156, 163, 175';

  const hasSeries = anchoredScores.length >= 2;
  const points = hasSeries
    ? anchoredScores.map((s, i) => `${toX(i / horizon)},${toY(s)}`).join(' ')
    : '';

  // Current dot sits at the left (now) at the current weather y-position.
  const curX = toX(0);
  const curY = currentScore != null ? toY(currentScore) : null;
  const lastScore = anchoredScores[anchoredScores.length - 1];
  const projX = toX(1);
  const projY = hasSeries ? toY(lastScore) : null;

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
      aria-label="Fire-weather trajectory over the next several hours"
    >
      <defs>
        <marker
          id="trajectory-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={lineColor} />
        </marker>
        <radialGradient id="now-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Composite-tier background bands — each horizontal weather band
          colored by the headline tier it maps to at the user's current threat.
          Higher weather (= more dangerous) is higher up. */}
      {W_TIERS.map((wTier, i) => {
        const composite = compositeFromBuckets(wTier, threatBucket) ?? wTier;
        const yTop = toY(bandEdges[i + 1]);
        const yBot = toY(bandEdges[i]);
        return (
          <rect
            key={`band-${wTier}`}
            x={inner.x0}
            y={yTop}
            width={innerW}
            height={yBot - yTop}
            fill={`rgba(${RISK_LEVELS[composite].glow}, 0.13)`}
          />
        );
      })}

      {/* Soft top light so the plot reads as a surface, not a flat fill. */}
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="url(#now-halo)"
        opacity={0.04}
      />

      {/* Weather tier-boundary lines (horizontal dashed). */}
      {[wBounds.low, wBounds.moderate, wBounds.extreme].map((b) => (
        <line
          key={`grid-w-${b}`}
          x1={inner.x0}
          y1={toY(b)}
          x2={inner.x1}
          y2={toY(b)}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.5"
          strokeDasharray="2,4"
        />
      ))}

      {/* Hour gridlines (vertical, faint) at each hour. */}
      {Array.from({ length: horizon + 1 }, (_, h) => h).map((h) => (
        <line
          key={`grid-t-${h}`}
          x1={toX(h / horizon)}
          y1={inner.y0}
          x2={toX(h / horizon)}
          y2={inner.y1}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="0.5"
        />
      ))}

      {/* Plot frame border. */}
      <rect
        x={inner.x0}
        y={inner.y0}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.5"
      />

      {/* Axis labels. */}
      <g style={{ fontFamily: ae.fontMono, fill: ae.textMute }}>
        {/* Y numeric ticks (weather) at 0, calibrated cutoffs, 1. */}
        {[
          { v: 0.0, lbl: '0.00' },
          { v: wBounds.low, lbl: wBounds.low.toFixed(2) },
          { v: wBounds.moderate, lbl: wBounds.moderate.toFixed(2) },
          { v: wBounds.extreme, lbl: wBounds.extreme.toFixed(2) },
          { v: 1.0, lbl: '1.00' },
        ].map((tick) => (
          <text
            key={`ytick-${tick.v}`}
            x={inner.x0 - 8}
            y={toY(tick.v) + 3}
            textAnchor="end"
            fontSize="9"
            fontWeight={600}
            letterSpacing="0.04em"
            fill={ae.textDim}
          >
            {tick.lbl}
          </text>
        ))}

        {/* Y tier badges centered in each weather band. */}
        {(['LOW', 'MOD', 'HIGH', 'EXT'] as const).map((name, i) => (
          <text
            key={`ytier-${name}`}
            x={inner.x0 - 34}
            y={toY((bandEdges[i] + bandEdges[i + 1]) / 2) + 3}
            textAnchor="end"
            fontSize="9"
            fontWeight={700}
            letterSpacing="0.16em"
            fill={ae.textMute}
          >
            {name}
          </text>
        ))}

        <text
          transform={`rotate(-90 ${inner.x0 - 64} ${(inner.y0 + inner.y1) / 2})`}
          x={inner.x0 - 64}
          y={(inner.y0 + inner.y1) / 2}
          textAnchor="middle"
          fontSize="10"
          fontWeight={700}
          letterSpacing="0.16em"
          fill={ae.text}
        >
          FIRE WEATHER (V4 SCORE)
        </text>

        {/* X time ticks — NOW at the left, every 2 hours up to +horizon. */}
        {Array.from({ length: horizon + 1 }, (_, h) => h)
          .filter((h) => h === 0 || h % 2 === 0)
          .map((h) => (
            <text
              key={`xtick-${h}`}
              x={toX(h / horizon)}
              y={inner.y1 + 16}
              textAnchor="middle"
              fontSize="9"
              fontWeight={h === 0 ? 800 : 600}
              letterSpacing="0.06em"
              fill={h === 0 ? ae.text : ae.textDim}
            >
              {h === 0 ? 'NOW' : `+${h}h`}
            </text>
          ))}

        <text
          x={(inner.x0 + inner.x1) / 2}
          y={inner.y1 + 34}
          textAnchor="middle"
          fontSize="10"
          fontWeight={700}
          letterSpacing="0.18em"
          fill={ae.text}
        >
          TIME →
        </text>
      </g>

      {/* Forecast curve (now → +horizon). */}
      {hasSeries && tone ? (
        <>
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth="6"
            strokeOpacity="0.18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#trajectory-arrow)"
            style={{ filter: `drop-shadow(0 0 6px rgba(${lineRgb}, 0.6))` }}
          />
          {/* Hour dots along the curve (skip the endpoints — drawn below). */}
          {anchoredScores.slice(1, -1).map((s, i) => (
            <circle
              key={`hourdot-${i}`}
              cx={toX((i + 1) / horizon)}
              cy={toY(s)}
              r="2.5"
              fill={lineColor}
              fillOpacity="0.85"
            />
          ))}
        </>
      ) : null}

      {/* +horizon projected dot (right edge). */}
      {hasSeries && projY != null && tone ? (
        <g>
          <circle cx={projX} cy={projY} r="11" fill={`rgba(${lineRgb}, 0.10)`} stroke={lineColor} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="3,2.5" />
          <circle cx={projX} cy={projY} r="4" fill={lineColor} fillOpacity="0.9" style={{ filter: `drop-shadow(0 0 8px rgba(${lineRgb}, 0.75))` }} />
          <text
            x={projX - 10}
            y={projY - 12}
            textAnchor="end"
            fontFamily={ae.fontMono}
            fontSize="9.5"
            fontWeight={700}
            letterSpacing="0.14em"
            fill={lineColor}
            style={{ textShadow: `0 0 6px rgba(${lineRgb}, 0.45)` }}
          >
            +{horizon} HR
          </text>
        </g>
      ) : null}

      {/* NOW dot (left edge) — drawn last so it sits on top. */}
      {curY != null ? (
        <g>
          <circle cx={curX} cy={curY} r="26" fill="url(#now-halo)" />
          <circle cx={curX} cy={curY} r="12" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="0.75" />
          <circle cx={curX} cy={curY} r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
          <circle cx={curX} cy={curY} r="5" fill="#fff" style={{ filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.85))' }} />
          <text
            x={curX + 10}
            y={curY - 12}
            fontFamily={ae.fontMono}
            fontSize="10"
            fontWeight={800}
            letterSpacing="0.14em"
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
  anchoredNow,
  anchoredProjected,
  currentComposite,
  projectedComposite,
  currentConditions,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  trajectory: TrajectoryResponse;
  anchoredNow: number | null;
  anchoredProjected: number | null;
  currentComposite: RiskLevel | null;
  projectedComposite: RiskLevel | null;
  currentConditions: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKph: number | null;
  };
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
          over the next {horizon} hours — the hour the curve crosses that band edge.
        </div>
      ) : null}

      {/* "Now" = your current Status reading (so it matches the cards above);
          "+horizon" = the Open-Meteo forecast it's heading toward. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
        <FrameTile
          ae={ae}
          label="Now"
          tempC={currentConditions.temperatureC}
          humidityPct={currentConditions.humidityPct}
          windKph={currentConditions.windKph}
          v4Score={anchoredNow}
        />
        <FrameTile
          ae={ae}
          label={`+${horizon} hr`}
          tempC={trajectory.projected.temperature_c}
          humidityPct={trajectory.projected.humidity_pct}
          windKph={trajectory.projected.wind_kph}
          v4Score={anchoredProjected}
        />
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 11,
          lineHeight: 1.5,
          color: ae.textMute,
          fontStyle: 'italic',
        }}
      >
        &ldquo;Now&rdquo; is your current Status reading; the +{horizon} hr projection is
        Open-Meteo&apos;s hourly forecast, and the trajectory tier reflects its now-vs-projected
        change.
      </p>
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
  const units = useUnits();
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
        <span style={{ color: ae.text }}>{tempC != null ? formatTemp(tempC, units.temp, 0) : '—'}</span>
        <span style={{ color: ae.textMute }}>RH</span>
        <span style={{ color: ae.text }}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</span>
        <span style={{ color: ae.textMute }}>Wind</span>
        <span style={{ color: ae.text }}>{windKph != null ? formatSpeed(windKph, units.speed, 0) : '—'}</span>
        <span style={{ color: ae.textMute }}>V4 score</span>
        <span style={{ color: ae.text, fontWeight: 700 }}>{v4Score != null ? v4Score.toFixed(2) : '—'}</span>
      </div>
    </div>
  );
}

'use client';

// The cinematic instrument-panel orb that anchors the Status hero.
// Composition (radii from interactions.jsx HeroOrb):
//   - outer tick ring at r=96 (60 ticks, every 6th elongated → 10 long ticks)
//   - risk arc at r=86 with linear-gradient stroke; arc LENGTH = the actual
//     numeric risk score (0–1), regionally re-mapped when thresholds are
//     supplied so the dial agrees with the regional level pill
//   - counter-rotating dashed ring at r=72 (slow spin)
//   - scanner sweep when alarming (high/extreme), spinning at 6s
//   - glassy core (86px) with icon — shield when calm, flame when alarming

import { Icon } from '@/components/Icon';
import { CursorParallax } from '@/components/ui/CursorParallax';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds } from '@/lib/api';
import { getRisk, type RiskLevel } from '@/lib/theme';

const SIZE = 220;
const RING_R = 96;
const ARC_R = 86;
const DASH_R = 72;
const SCAN_R = 80;
// Floor so the endpoint dot is always visible even when score is tiny.
const ARC_MIN_FRACTION = 0.04;

// Round trig outputs so SSR and client produce the same SVG attribute strings
// (V8 in Node and browsers stringify some floats differently — pure cosmetic
// hydration mismatch otherwise).
const round = (n: number): number => Math.round(n * 1000) / 1000;
// Fallback arc fractions for callers that only know the LEVEL, not the score
// (e.g. transitional / loading state where /risk hasn't returned yet).
const FALLBACK_RATIO: Record<RiskLevel, number> = {
  low: 0.18,
  moderate: 0.45,
  high: 0.72,
  extreme: 0.95,
};

/** Map an absolute 0–1 risk score to the arc fraction the dial should show.
 *  Ported from mobile (app/components/ui/HeroOrb.tsx scoreToFraction):
 *  piecewise linear so each bucket boundary lands at a meaningful visual
 *  position when regional thresholds are present. Without thresholds, raw
 *  score is the fraction. */
function scoreToFraction(score: number, t: RegionalThresholds | null | undefined): number {
  if (!t) return score;
  if (!(t.low > 0 && t.moderate > t.low && t.extreme > t.moderate && t.score_max >= t.extreme)) {
    return score;
  }
  if (score <= 0) return 0;
  if (score < t.low) return (score / t.low) * 0.50;
  if (score < t.moderate) return 0.50 + ((score - t.low) / (t.moderate - t.low)) * 0.25;
  if (score < t.extreme) return 0.75 + ((score - t.moderate) / (t.extreme - t.moderate)) * 0.22;
  if (t.score_max <= t.extreme) return 1.0;
  const past = (score - t.extreme) / (t.score_max - t.extreme);
  return Math.min(1.0, 0.97 + past * 0.03);
}

export function HeroOrb({
  risk,
  score,
  thresholds,
  pulseSpeed = 70,
}: {
  risk: RiskLevel;
  /** Actual numeric risk score 0–1. When provided, drives the arc fill so
   *  the dial reflects the real percentile, not just the bucket. Falls back
   *  to FALLBACK_RATIO[risk] when omitted (transitional loading state). */
  score?: number | null;
  /** Per-state cutoffs from /risk. When present, the arc maps regionally so
   *  it agrees with the regional-level pill (e.g. Florida's 97th percentile
   *  pegs the dial at 97% even though absolute score is lower). */
  thresholds?: RegionalThresholds | null;
  pulseSpeed?: number;
}) {
  const { ae, accent } = useAesthetic();
  const r = getRisk(risk, accent);
  const isAlarming = risk === 'high' || risk === 'extreme';
  const pulseDur = 4 - (pulseSpeed / 100) * 2.5;

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const arcLen = 2 * Math.PI * ARC_R;
  // Arc fraction — derived from real score when available (with regional
  // re-mapping), else falls back to the per-level constant so the orb still
  // has visual presence during the brief load window before /risk lands.
  const ratio =
    score != null
      ? Math.max(ARC_MIN_FRACTION, Math.min(1, scoreToFraction(score, thresholds)))
      : FALLBACK_RATIO[risk];

  // Outer tick ring — 60 ticks total, every 6th elongated, yielding 10
  // prominent ticks at 36° intervals. Matches mobile (was every 5th = 12
  // long ticks, which read as a clock face). Total density unchanged.
  const ticks: React.ReactElement[] = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const long = i % 6 === 0;
    const r1 = RING_R + (long ? 2 : 4);
    const r2 = RING_R + (long ? 10 : 7);
    ticks.push(
      <line
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        x1={round(cx + Math.cos(a) * r1)}
        y1={round(cy + Math.sin(a) * r1)}
        x2={round(cx + Math.cos(a) * r2)}
        y2={round(cy + Math.sin(a) * r2)}
        stroke={ae.text}
        strokeOpacity={long ? 0.32 : 0.10}
        strokeWidth={long ? 0.9 : 0.5}
      />,
    );
  }

  // Endpoint dot — where the arc ends
  const endA = -Math.PI / 2 + ratio * Math.PI * 2;
  const endX = cx + Math.cos(endA) * ARC_R;
  const endY = cy + Math.sin(endA) * ARC_R;

  return (
    <CursorParallax strength={8}>
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}
      >
        {/* Pulse rings — only when alarming */}
        {isAlarming
          ? [0, 1, 2].map((i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                style={{
                  position: 'absolute',
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  border: `1px solid ${r.color}`,
                  animation: `ember-pulse-2 ${pulseDur}s cubic-bezier(0.2, 0.7, 0.3, 1) infinite`,
                  animationDelay: `${i * (pulseDur / 3)}s`,
                }}
              />
            ))
          : null}

        {/* Soft glow */}
        <div
          style={{
            position: 'absolute',
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${r.glow}, ${isAlarming ? 0.32 : 0.10}) 0%, transparent 60%)`,
            filter: 'blur(10px)',
            pointerEvents: 'none',
          }}
        />

        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ position: 'absolute' }}
        >
          <defs>
            <linearGradient id={`orb-arc-${risk}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={r.color} stopOpacity="0.2" />
              <stop offset="50%" stopColor={r.color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={r.color} stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id={`orb-scan-${risk}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={r.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={r.color} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Faint outer ring */}
          <circle
            cx={cx}
            cy={cy}
            r={RING_R}
            fill="none"
            stroke={ae.lineStrong}
            strokeWidth="0.5"
            strokeOpacity="0.5"
          />

          {ticks}

          {/* Track */}
          <circle cx={cx} cy={cy} r={ARC_R} fill="none" stroke={ae.line} strokeWidth="2" />

          {/* Risk arc */}
          <circle
            cx={cx}
            cy={cy}
            r={ARC_R}
            fill="none"
            stroke={`url(#orb-arc-${risk})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${arcLen * ratio} ${arcLen}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: 'stroke-dasharray 1.2s cubic-bezier(0.3, 1.2, 0.4, 1)',
              filter: `drop-shadow(0 0 8px ${r.color})`,
            }}
          />

          {/* Endpoint dot */}
          <g style={{ transition: 'transform 1.2s cubic-bezier(0.3, 1.2, 0.4, 1)' }}>
            <circle
              cx={endX}
              cy={endY}
              r="4.5"
              fill={r.color}
              style={{ filter: `drop-shadow(0 0 8px ${r.color})` }}
            />
            <circle cx={endX} cy={endY} r="2" fill="#fff" />
          </g>

          {/* Counter-rotating dashed ring */}
          <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'px-slow-rot-rev 22s linear infinite' }}>
            <circle
              cx={cx}
              cy={cy}
              r={DASH_R}
              fill="none"
              stroke={r.color}
              strokeOpacity={isAlarming ? 0.38 : 0.18}
              strokeWidth="0.6"
              strokeDasharray="2 5"
            />
          </g>

          {/* Scanner sweep — only when alarming */}
          {isAlarming ? (
            <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'px-slow-rot 6s linear infinite' }}>
              <path
                d={`M ${cx} ${cy} L ${cx + SCAN_R} ${cy} A ${SCAN_R} ${SCAN_R} 0 0 0 ${cx + Math.cos(-0.6) * SCAN_R} ${cy + Math.sin(-0.6) * SCAN_R} Z`}
                fill={`url(#orb-scan-${risk})`}
                opacity="0.55"
              />
            </g>
          ) : null}
        </svg>

        {/* Glassy core */}
        <div
          style={{
            position: 'relative',
            width: 86,
            height: 86,
            borderRadius: '50%',
            background: isAlarming
              ? `radial-gradient(circle at 30% 30%, ${r.color}, rgba(${r.glow}, 0.7) 55%, rgba(${r.glow}, 0.25))`
              : `radial-gradient(circle at 30% 30%, ${ae.surface2}, ${ae.surface})`,
            border: `0.5px solid rgba(${r.glow}, ${isAlarming ? 0.7 : 0.18})`,
            boxShadow: isAlarming
              ? `0 0 50px rgba(${r.glow}, 0.55),
                 inset 0 0 24px rgba(255,255,255,0.20),
                 inset 0 1px 0 rgba(255,255,255,0.35),
                 inset 0 -10px 20px rgba(0,0,0,0.25)`
              : `inset 0 0 18px rgba(255,255,255,0.04),
                 inset 0 1px 0 rgba(255,255,255,0.10),
                 inset 0 -8px 18px rgba(0,0,0,0.25)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isAlarming ? `ember-flicker ${pulseDur * 0.7}s ease-in-out infinite` : 'none',
            overflow: 'hidden',
          }}
        >
          {/* Glass reflection */}
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 12,
              width: 36,
              height: 18,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.55), transparent 70%)',
              filter: 'blur(1px)',
              opacity: 0.85,
            }}
          />
          {/* Inner conic shine */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background:
                'conic-gradient(from 210deg, transparent 0deg, rgba(255,255,255,0.10) 60deg, transparent 120deg)',
              mixBlendMode: 'overlay',
            }}
          />
          <Icon
            name={isAlarming ? 'flame' : 'shield'}
            size={36}
            color={isAlarming ? '#fff' : ae.textDim}
            strokeWidth={1.6}
          />
        </div>
      </div>
    </CursorParallax>
  );
}

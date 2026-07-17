'use client';

// Horizontal arc gauge — 4 risk zones laid side-by-side, with a marker
// triangle indicating the current score's position.
// Each zone's width = (next_threshold - prev_threshold). Marker x = score.
//
// Per api/core/regional_calibration.py, the four bucket boundaries are
//   LOW < thresholds.low           (50th percentile)
//   MODERATE < thresholds.moderate (75th)
//   HIGH < thresholds.extreme      (97th — *not* thresholds.high which is 90th)
//   EXTREME ≥ thresholds.extreme
// thresholds.high (90th) is informational only; mobile ScoreGauge has the
// same note. Don't mix it into the boundary math.

import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

interface Zone {
  level: RiskLevel;
  until: number;
  color: string;
  label: string;
}

/** V4 global defaults from api/core/risk_algorithm.py._bucket — used when
 *  the user isn't in a fitted state and the backend returns null thresholds. */
export const GLOBAL_THRESHOLDS = { low: 0.3, moderate: 0.6, extreme: 0.8 } as const;

export function ScoreGauge({
  score,
  thresholds = GLOBAL_THRESHOLDS,
}: {
  score: number;
  thresholds?: { low: number; moderate: number; extreme: number };
}) {
  const { ae, accent } = useAesthetic();
  const zones: Zone[] = [
    { level: 'low',      until: thresholds.low,      color: RISK_LEVELS.low.color,            label: 'LOW' },
    { level: 'moderate', until: thresholds.moderate, color: RISK_LEVELS.moderate.color,       label: 'MOD' },
    { level: 'high',     until: thresholds.extreme, color: getRisk('high', accent).color,    label: 'HIGH' },
    { level: 'extreme',  until: 1.00,                color: getRisk('extreme', accent).color, label: 'EXT' },
  ];

  const W = 320;
  const H = 64;
  const pad = 6;
  const innerW = W - pad * 2;

  let cursor = 0;
  const segments = zones.map((z) => {
    const from = cursor;
    cursor = z.until;
    return { ...z, from, to: z.until, w: (z.until - from) * innerW };
  });

  const markerX = pad + Math.min(1, Math.max(0, score)) * innerW;

  // Which band the score lands in — for the text alternative. Mirrors the
  // boundary math above (LOW < low, MOD < moderate, HIGH < extreme, else EXT).
  const activeZone =
    zones.find((z) => score < z.until) ?? zones[zones.length - 1];

  return (
    <div style={{ position: 'relative', width: W, maxWidth: '100%', height: H, margin: '0 auto' }}>
      {/* role="img" + aria-label collapses the SVG's loose LOW/MOD/HIGH/EXT/SCORE
          text fragments into one meaningful announcement for screen readers. */}
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Risk score ${score.toFixed(2)} of 1.00, ${activeZone.label} band.`}
      >
        {segments.map((s, i) => {
          const x = pad + s.from * innerW;
          const rgb = hexToRgb(s.color);
          return (
            <g key={s.level}>
              <rect
                x={x + 0.5}
                y={28}
                width={s.w - 1}
                height={6}
                rx={3}
                fill={`rgba(${rgb}, 0.18)`}
                stroke={`rgba(${rgb}, 0.40)`}
                strokeWidth="0.5"
              />
              <text
                x={x + s.w / 2}
                y={50}
                fontFamily={ae.fontMono}
                fontSize="9"
                fontWeight="600"
                letterSpacing="0.12em"
                fill={`rgba(${rgb}, 0.85)`}
                textAnchor="middle"
              >
                {s.label}
              </text>
              {i < segments.length - 1 ? (
                <line
                  x1={x + s.w}
                  y1="24"
                  x2={x + s.w}
                  y2="38"
                  stroke={ae.lineStrong}
                  strokeWidth="0.5"
                />
              ) : null}
            </g>
          );
        })}
        <g>
          <line x1={markerX} y1="14" x2={markerX} y2="38" stroke="#fff" strokeWidth="1.5" />
          <circle
            cx={markerX}
            cy="14"
            r="5"
            fill="#fff"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.7))' }}
          />
          <text
            x={markerX}
            y="9"
            textAnchor="middle"
            fontFamily={ae.fontMono}
            fontSize="9"
            fontWeight="700"
            letterSpacing="0.08em"
            fill="#fff"
          >
            SCORE
          </text>
        </g>
      </svg>
    </div>
  );
}

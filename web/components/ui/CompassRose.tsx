'use client';

// Compass with 4 cardinal letters + tick marks + rotating arrow needle.
// `bearingDeg` is the direction the needle points (0° = N, 90° = E, etc).
// `cardinal` is the closest cardinal label (N/NE/E/SE/...) to highlight.

import { useAesthetic } from '@/lib/aesthetic';

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function CompassRose({
  bearingDeg,
  cardinal,
  color,
  glowRgb,
  size = 110,
}: {
  bearingDeg: number;
  /** Which of N/E/S/W to highlight as the active label. */
  cardinal?: 'N' | 'E' | 'S' | 'W';
  color: string;
  glowRgb: string;
  size?: number;
}) {
  const { ae } = useAesthetic();
  const c = size / 2;

  // Direction letters around the rose
  const letters: ('N' | 'E' | 'S' | 'W')[] = ['N', 'E', 'S', 'W'];

  // Tick marks (24 of them, every 15°)
  const ticks: React.ReactElement[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 15 * Math.PI) / 180;
    const x1 = round(c + Math.cos(a) * (c - 8));
    const y1 = round(c + Math.sin(a) * (c - 8));
    const x2 = round(c + Math.cos(a) * (c - (i % 3 === 0 ? 13 : 11)));
    const y2 = round(c + Math.sin(a) * (c - (i % 3 === 0 ? 13 : 11)));
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={i % 6 === 0 ? ae.lineStrong : ae.line}
        strokeWidth="0.5"
      />,
    );
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="compass-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="60%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* halo */}
        <circle cx={c} cy={c} r={c - 4} fill="url(#compass-halo)" />
        {/* outer ring */}
        <circle cx={c} cy={c} r={c - 6} fill="none" stroke={ae.lineStrong} strokeWidth="0.5" />
        <circle
          cx={c}
          cy={c}
          r={c - 18}
          fill="none"
          stroke={ae.line}
          strokeWidth="0.5"
          strokeDasharray="2 3"
        />
        {ticks}
        {/* direction letters */}
        {letters.map((d, i) => {
          const a = ((i * 90 - 90) * Math.PI) / 180;
          const x = round(c + Math.cos(a) * (c - 26));
          const y = round(c + Math.sin(a) * (c - 26) + 3.5);
          const active = d === cardinal;
          return (
            <text
              key={d}
              x={x}
              y={y}
              textAnchor="middle"
              fontFamily={ae.fontMono}
              fontSize="9.5"
              fontWeight={active ? 700 : 500}
              fill={active ? color : ae.textMute}
              letterSpacing="0.04em"
            >
              {d}
            </text>
          );
        })}
        {/* arrow needle */}
        <g transform={`rotate(${bearingDeg} ${c} ${c})`}>
          <polygon
            points={`${c},${c - (c - 22)} ${c - 5},${c + 4} ${c + 5},${c + 4}`}
            fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          <polygon
            points={`${c},${c + (c - 32)} ${c - 4},${c - 2} ${c + 4},${c - 2}`}
            fill={`rgba(${glowRgb}, 0.30)`}
          />
          <circle cx={c} cy={c} r="4" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <circle cx={c} cy={c} r="1.5" fill="#fff" />
        </g>
      </svg>
    </div>
  );
}

/** Pick the nearest 8-point cardinal label (N/NE/E/SE/...) for a bearing. */
export function cardinalOf(bearingDeg: number): 'N' | 'E' | 'S' | 'W' {
  const norm = ((bearingDeg % 360) + 360) % 360;
  if (norm < 45 || norm >= 315) return 'N';
  if (norm < 135) return 'E';
  if (norm < 225) return 'S';
  return 'W';
}

/** Eight-point cardinal label (used in text like "fire is NE at 4.2 mi"). */
export function cardinal8(bearingDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const norm = ((bearingDeg % 360) + 360) % 360;
  return dirs[Math.round(norm / 45) % 8];
}

'use client';

// Small compass with a rotating arrow + tick marks. `angle` is the direction
// the wind is blowing TOWARD, measured clockwise from north (0° = N).

import { useAesthetic } from '@/lib/aesthetic';

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function WindDial({
  angle = 0,
  color,
  size = 56,
  unit,
}: {
  angle?: number;
  color: string;
  size?: number;
  unit?: string;
}) {
  const { ae } = useAesthetic();
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size / 2 - 2;

  const ticks: React.ReactElement[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const long = i % 6 === 0;
    const r1 = ringR - (long ? 3.5 : 2);
    const r2 = ringR;
    ticks.push(
      <line
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        x1={round(cx + Math.cos(a) * r1)}
        y1={round(cy + Math.sin(a) * r1)}
        x2={round(cx + Math.cos(a) * r2)}
        y2={round(cy + Math.sin(a) * r2)}
        stroke={ae.textMute}
        strokeOpacity={long ? 0.55 : 0.25}
        strokeWidth="0.6"
      />,
    );
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={ae.line} strokeWidth="0.5" />
        {ticks}
        <g
          transform={`rotate(${angle} ${cx} ${cy})`}
          style={{ transition: 'transform 0.9s cubic-bezier(0.3, 1.2, 0.4, 1)' }}
        >
          <polygon
            points={`${cx},${cy - ringR + 4} ${cx - 4},${cy + 2} ${cx},${cy - 1} ${cx + 4},${cy + 2}`}
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
          <circle cx={cx} cy={cy} r="1.5" fill={color} />
        </g>
      </svg>
      {unit ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 8,
              color: ae.textMute,
              letterSpacing: '0.06em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
              marginTop: size * 0.45,
            }}
          >
            {unit}
          </span>
        </div>
      ) : null}
    </div>
  );
}

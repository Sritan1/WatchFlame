'use client';

// Micro vertical-bar chart. The last bar is highlighted with the accent color
// + a soft glow + a slow opacity pulse — draws the eye to the latest value.

import { useAesthetic } from '@/lib/aesthetic';

export function Sparkline({
  data,
  color,
  width = 64,
  height = 22,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const { ae } = useAesthetic();
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const bw = (width - (data.length - 1) * 2) / data.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const isLast = i === data.length - 1;
        const h = ((v - min) / range) * (height - 4) + 4;
        const x = i * (bw + 2);
        const y = height - h;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={Math.min(1.5, bw / 2)}
              fill={isLast ? color : ae.lineStrong}
              opacity={isLast ? 1 : 0.55}
            >
              {isLast ? (
                <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
              ) : null}
            </rect>
            {isLast ? (
              <rect
                x={x - 1}
                y={y - 1}
                width={bw + 2}
                height={h + 2}
                rx={Math.min(1.5, bw / 2)}
                fill="none"
                stroke={color}
                strokeOpacity="0.4"
                strokeWidth="0.6"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

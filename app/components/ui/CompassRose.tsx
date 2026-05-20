import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

/**
 * Compass rose with N/E/S/W labels and an arrow needle that points at a
 * precise heading. Used on the Safety screen's "Suggested Direction" and
 * "Closest Potential Shelter" cards to visualize the recommended bearing.
 *
 * Pass `bearingDeg` in degrees clockwise from north (0 = north, 90 = east,
 * 180 = south, 270 = west) for full precision. The cardinal-letter
 * highlight snaps to whichever of N/E/S/W is closest.
 */
export function CompassRose({
  color,
  rgb,
  bearingDeg = 0,
  size = 108,
}: {
  color: string;
  /** Comma-separated RGB triplet matching `color` (e.g. '232, 179, 57'). */
  rgb: string;
  /** Heading in degrees clockwise from north. 0 → arrow points up (N). */
  bearingDeg?: number;
  size?: number;
}) {
  const c = size / 2;
  // SVG rotation: bearing 0 (north) should mean the arrow points up. The
  // needle geometry below is drawn pointing up at angle 0, so we feed the
  // bearing directly into rotate(). Normalize to [0, 360).
  const normalized = ((bearingDeg % 360) + 360) % 360;
  // Highlighted cardinal letter — whichever of N/E/S/W is closest to the
  // bearing. Bands: N (315..45), E (45..135), S (135..225), W (225..315).
  const closestCardinal: 'N' | 'E' | 'S' | 'W' =
    normalized < 45 || normalized >= 315 ? 'N'
    : normalized < 135 ? 'E'
    : normalized < 225 ? 'S'
    : 'W';
  const ticks = Array.from({ length: 24 });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="rose-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="60%" stopColor={color} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Outer halo */}
        <Circle cx={c} cy={c} r={c - 4} fill="url(#rose-glow)" />
        {/* Outer ring */}
        <Circle cx={c} cy={c} r={c - 6} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.5} />
        {/* Inner dashed ring */}
        <Circle
          cx={c} cy={c} r={c - 18}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}
          strokeDasharray="2 3"
        />

        {/* Tick marks — every 15° around the rim */}
        {ticks.map((_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const x1 = c + Math.cos(a) * (c - 8);
          const y1 = c + Math.sin(a) * (c - 8);
          const long = i % 3 === 0;
          const inner = long ? c - 13 : c - 11;
          const x2 = c + Math.cos(a) * inner;
          const y2 = c + Math.sin(a) * inner;
          return (
            <Line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i % 6 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Direction letters */}
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
          const a = ((i * 90 - 90) * Math.PI) / 180;
          const x = c + Math.cos(a) * (c - 26);
          const y = c + Math.sin(a) * (c - 26) + 3.5;
          const active = d === closestCardinal;
          return (
            <SvgText
              key={d}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={active ? '700' : '500'}
              fill={active ? color : '#6b7280'}
              letterSpacing={0.4}
            >
              {d}
            </SvgText>
          );
        })}

        {/* Arrow needle — rotated to the exact bearing */}
        <G transform={`rotate(${normalized} ${c} ${c})`}>
          {/* Forward triangle (pointing up, glowing) */}
          <Polygon
            points={`${c},${c - (c - 22)} ${c - 5},${c + 4} ${c + 5},${c + 4}`}
            fill={color}
          />
          {/* Back triangle (faint glow) */}
          <Polygon
            points={`${c},${c + (c - 32)} ${c - 4},${c - 2} ${c + 4},${c - 2}`}
            fill={`rgba(${rgb}, 0.30)`}
          />
          {/* Pivot */}
          <Circle cx={c} cy={c} r={4} fill={color} />
          <Circle cx={c} cy={c} r={1.5} fill="#ffffff" />
        </G>

        {/* Invisible overlay to keep gradient bounds — react-native-svg quirk */}
        <Rect x={0} y={0} width={size} height={size} fill="transparent" />
      </Svg>
    </View>
  );
}

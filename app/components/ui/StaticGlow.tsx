import { Dimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

const SCREEN = Dimensions.get('window');

type GlowSpec = {
  id: string;
  cx: string;     // SVG percentage, e.g. "85%"
  cy: string;
  r: string;
  a0: number;     // peak alpha
  a1: number;     // mid alpha
  a2: number;     // outer alpha
};

// One top-right glow (used by Risk).
const SINGLE: GlowSpec[] = [
  { id: 'g-tr', cx: '85%', cy: '12%', r: '75%', a0: 0.18, a1: 0.08, a2: 0.025 },
];

// Three-glow composition (used by Safety): top-right + smaller upper-left
// accent + Risk-sized bottom-left. Variety comes from layout, not brightness.
const TRIO: GlowSpec[] = [
  { id: 'g-tr',    cx: '85%', cy: '12%', r: '75%', a0: 0.18, a1: 0.08, a2: 0.025 },
  { id: 'g-l-sm',  cx: '12%', cy: '15%', r: '42%', a0: 0.15, a1: 0.07, a2: 0.022 },
  { id: 'g-bl',    cx: '18%', cy: '88%', r: '75%', a0: 0.18, a1: 0.08, a2: 0.025 },
];

type Palette = 'amber' | 'green';

// Stops are tuned per-palette: warm Status-matching amber, or a muted
// sanctuary green (sage → forest) that reads calm rather than urgent.
const PALETTES: Record<Palette, { c0: string; c1: string; c2: string }> = {
  amber: { c0: '#e8b339', c1: '#dc823c', c2: '#b46446' },
  green: { c0: '#7ee787', c1: '#4f9d6a', c2: '#2d5a3d' },
};

/**
 * Zero-animation backdrop — one or more radial glows over a solid-dark base.
 *
 * `layout="single"` (default): one top-right glow.
 * `layout="trio"`: top-right + smaller upper-left + bottom-left.
 *
 * `palette="amber"` (default): warm tones, used on Risk to echo Status's waves.
 * `palette="green"`: muted sanctuary green, used on Safety.
 */
export function StaticGlow({
  layout = 'single',
  palette = 'amber',
}: {
  layout?: 'single' | 'trio';
  palette?: Palette;
}) {
  const w = SCREEN.width;
  const h = SCREEN.height;
  const specs = layout === 'trio' ? TRIO : SINGLE;
  const { c0, c1, c2 } = PALETTES[palette];

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0a0a0b',
      }}
    >
      <Svg width={w} height={h}>
        <Defs>
          {specs.map((g) => (
            <RadialGradient
              key={g.id}
              id={g.id}
              cx={g.cx}
              cy={g.cy}
              r={g.r}
              gradientTransform="matrix(1 0 0 1.1 0 0)"
            >
              <Stop offset="0%" stopColor={c0} stopOpacity={g.a0} />
              <Stop offset="35%" stopColor={c1} stopOpacity={g.a1} />
              <Stop offset="70%" stopColor={c2} stopOpacity={g.a2} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {specs.map((g) => (
          <Rect key={`fill-${g.id}`} x={0} y={0} width={w} height={h} fill={`url(#${g.id})`} />
        ))}
      </Svg>
    </View>
  );
}

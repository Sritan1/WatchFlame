import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

import { EASE, MOTION } from '@/lib/theme';

/**
 * Compact wind direction dial — 24 tick marks (long every 6) + a center arrow
 * pointing the direction the wind is blowing FROM (meteorological convention).
 *
 * Renders even when `bearingDeg` is null (just shows the dial face, no
 * arrow) — useful as a compact "card decoration" that doesn't disappear
 * during loading.
 */
export function WindDial({
  bearingDeg,
  size = 44,
  color = '#7ee787',
}: {
  bearingDeg: number | null;
  size?: number;
  color?: string;
}) {
  // Animate rotation with springy overshoot to "snap into place" rather than
  // glide — feels more like an instrument needle.
  const rotation = useSharedValue(bearingDeg ?? 0);
  useEffect(() => {
    if (bearingDeg == null) return;
    rotation.value = withTiming(bearingDeg, {
      duration: 900,
      easing: EASE.spring,
    });
  }, [bearingDeg, rotation]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const cx = size / 2;
  const cy = size / 2;
  const ringR = size / 2 - 1;
  const tickOuter = ringR;
  const tickInnerLong = ringR - 4;
  const tickInnerShort = ringR - 2;

  // 24 ticks: every 6th is "long" (cardinal/intercardinal direction).
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const isLong = i % 6 === 0;
    const angleRad = (i / 24) * 2 * Math.PI - Math.PI / 2;
    const innerR = isLong ? tickInnerLong : tickInnerShort;
    return {
      x1: cx + Math.cos(angleRad) * innerR,
      y1: cy + Math.sin(angleRad) * innerR,
      x2: cx + Math.cos(angleRad) * tickOuter,
      y2: cy + Math.sin(angleRad) * tickOuter,
      isLong,
    };
  });

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Faint outer ring */}
        <Circle
          cx={cx}
          cy={cy}
          r={ringR}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={0.6}
          fill="none"
        />
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isLong ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.20)'}
            strokeWidth={t.isLong ? 1 : 0.6}
          />
        ))}
      </Svg>
      {/* Arrow on top, animated via Reanimated transform on the wrapper.
       *  Pointing UP at 0deg → rotated to bearingDeg means the arrow
       *  points the direction the wind is coming FROM. */}
      {bearingDeg != null ? (
        <Animated.View
          style={[
            { width: size, height: size, position: 'absolute', alignItems: 'center', justifyContent: 'center' },
            arrowStyle,
          ]}
        >
          <Svg width={size} height={size}>
            <Polygon
              points={`${cx},${cy - ringR + 3} ${cx - 3},${cy + 1} ${cx + 3},${cy + 1}`}
              fill={color}
            />
            <Circle cx={cx} cy={cy + 1} r={1.6} fill={color} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Convert a meteorological bearing (0–360°, where wind comes from) to a
 *  3-letter cardinal label: N, NNE, NE, ENE, E, … */
export function cardinalFromBearing(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return '—';
  const labels = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const i = Math.round(((deg % 360) + 360) / 22.5) % 16;
  return labels[i];
}

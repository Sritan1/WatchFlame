import { useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';

import { RadialGlow } from './RadialGlow';

/** Diagonal stripe pattern — replicates the screens.jsx StripePattern,
 *  gives a card the "federal/official" textured feel. Same measured-
 *  dimensions approach as GridPattern below (react-native-svg's
 *  `<Pattern>` + `Rect width="100%"` combo is unreliable). */
export function StripePattern({
  color,
  opacity = 0.05,
  spacing = 10,
}: {
  color: string;
  opacity?: number;
  spacing?: number;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) {
          setSize({ w: width, h: height });
        }
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          {Array.from({ length: Math.ceil((size.w + size.h) / spacing) }).map((_, i) => {
            const startX = i * spacing - size.h;
            return (
              <Line
                key={i}
                x1={startX}
                y1={size.h}
                x2={startX + size.h}
                y2={0}
                stroke={color}
                strokeWidth={1}
                opacity={opacity}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/** Faint grid pattern overlay — replicates the screens.jsx GridPattern.
 *  Measures the parent via onLayout and draws explicit horizontal +
 *  vertical Line elements (react-native-svg's `<Pattern>` element + Rect
 *  with percentage dimensions is unreliable). Exported standalone so
 *  cards that want the texture without the full PremiumCard chrome can
 *  drop it in. */
export function GridPattern({
  opacity = 0.05,
  spacing = 14,
}: {
  opacity?: number;
  spacing?: number;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) {
          setSize({ w: width, h: height });
        }
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          {Array.from({ length: Math.ceil(size.w / spacing) + 1 }).map((_, i) => (
            <Line
              key={`v${i}`}
              x1={i * spacing}
              y1={0}
              x2={i * spacing}
              y2={size.h}
              stroke="#ffffff"
              strokeWidth={0.5}
              opacity={opacity}
            />
          ))}
          {Array.from({ length: Math.ceil(size.h / spacing) + 1 }).map((_, i) => (
            <Line
              key={`h${i}`}
              x1={0}
              y1={i * spacing}
              x2={size.w}
              y2={i * spacing}
              stroke="#ffffff"
              strokeWidth={0.5}
              opacity={opacity}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Premium dark card chrome — slate `surface2 → surface` gradient with a
 *  level-tinted hairline border, top accent glow stripe, faint grid
 *  texture, and a soft corner halo. Mirrors the screens.jsx FeatureCard /
 *  Suggested-Direction-card treatment, used as the hero container for
 *  Risk's score block and Safety's away/shelter cards. */
export function PremiumCard({
  rgb,
  accentColor,
  children,
  padding = 18,
  glowPosition = 'bottomRight',
  glowIntensity = 0.20,
  textureOpacity = 0.05,
  texture = 'grid',
}: {
  /** Comma-separated RGB triplet matching `accentColor`. */
  rgb: string;
  /** Hex accent color — drives the border tint, top stripe, corner halo. */
  accentColor: string;
  children: React.ReactNode;
  padding?: number;
  /** Where to place the soft corner halo. Defaults to bottom-right. */
  glowPosition?: 'bottomRight' | 'topRight';
  /** Center alpha of the corner halo. */
  glowIntensity?: number;
  /** Alpha of the texture lines (0 = no texture). */
  textureOpacity?: number;
  /** Which texture pattern to draw — `grid` (default) reads as a
   *  technical / data feel, `stripe` reads as official / federal. */
  texture?: 'grid' | 'stripe';
}) {
  const glowOffset =
    glowPosition === 'topRight'
      ? { position: 'absolute' as const, top: -80, right: -80 }
      : { position: 'absolute' as const, bottom: -80, right: -80 };
  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: `rgba(${rgb}, 0.30)`,
      }}
    >
      {/* Gradient surface — slate-dark, matches Safety's premium cards. */}
      <LinearGradient
        colors={['#161B24', '#10141B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Top glow stripe — 3px height, transparent→accent→transparent gradient. */}
      <View style={{ height: 3 }}>
        <LinearGradient
          colors={['transparent', accentColor, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>
      {/* Faint texture overlay (skip when textureOpacity === 0). */}
      {textureOpacity > 0 ? (
        texture === 'stripe' ? (
          <StripePattern color={accentColor} opacity={textureOpacity} />
        ) : (
          <GridPattern opacity={textureOpacity} />
        )
      ) : null}
      {/* Soft corner halo — SVG radial gradient fading to transparent. */}
      <RadialGlow rgb={rgb} size={260} intensity={glowIntensity} style={glowOffset} />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

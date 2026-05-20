import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * Soft radial glow primitive — an SVG circle filled with a radial gradient
 * that fades from `rgb` at the center to transparent at the edge. Used as
 * the corner/accent glow on premium cards (FEMA banner, Suggested Direction)
 * where CSS `radial-gradient` + `filter: blur` isn't available in RN.
 *
 * Position the wrapping View with `style.position = 'absolute'` + the
 * desired top/right/bottom/left offsets. The glow extends to the edges of
 * the View; let it overflow off the card for a true halo effect (the
 * parent should have `overflow: 'hidden'` to crop the part that bleeds
 * outside the card).
 */
export function RadialGlow({
  rgb,
  size,
  intensity = 0.20,
  style,
}: {
  /** Comma-separated RGB triplet, e.g. '232, 179, 57'. */
  rgb: string;
  /** Diameter in points; the glow radius is half of this. */
  size: number;
  /** Center alpha — fades to 0 at the edge. Typical: 0.15–0.25. */
  intensity?: number;
  /** Absolute-position offsets + any other layout style. */
  style?: React.ComponentProps<typeof View>['style'];
}) {
  // Each instance needs its own gradient id so multiple RadialGlows on the
  // same screen don't share defs (which would clobber each other's colors).
  const gradId = `glow-${useId().replace(/[:]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={`rgb(${rgb})`} stopOpacity={intensity} />
            <Stop offset="40%" stopColor={`rgb(${rgb})`} stopOpacity={intensity * 0.45} />
            <Stop offset="100%" stopColor={`rgb(${rgb})`} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
      </Svg>
    </View>
  );
}

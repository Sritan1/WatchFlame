import { View, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Subtle slate-tinted card chrome for input surfaces (sliders, pickers,
 * the factor breakdown). Looks like a quieter cousin of PremiumCard:
 *
 *   - Same `surface2 → surface` slate gradient
 *   - 0.5px hairline border at low white alpha
 *   - 0.5px inset top white hairline for depth
 *   - No top accent stripe, no corner halo, no texture
 *
 * Use this where the eye should rest (data inputs); use PremiumCard for
 * hero elements (score, suggested-direction, FEMA banner) where the
 * colored accent + glow earns its weight.
 */
export function InputCard({
  children,
  padding = 16,
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: 'rgba(255,255,255,0.09)',
          position: 'relative',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['#161B24', '#10141B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Inset top hairline highlight — the depth cue that lifts the card
       *  off the page without needing a heavier border or shadow. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 0.5,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Section ribbon — a horizontal divider with a colored dot, monospace
 * eyebrow label, and a hairline gradient running to the right edge of
 * the screen. Mirrors the design in premium.jsx (`SectionRibbon`) and
 * Status-aligned styling. Used to anchor major sections on Safety / Risk.
 *
 * The eyebrow is rendered uppercase, mono, wide tracking. The gradient
 * tail fades to transparent. An optional `action` slot renders on the
 * right side after the gradient — used e.g. for the "Reset to my area"
 * pill next to the Risk screen's INPUTS ribbon.
 */
export function SectionRibbon({
  color,
  rgb,
  eyebrow,
  action,
}: {
  /** Hex color for the dot and label (e.g. '#e8b339'). */
  color: string;
  /** Comma-separated RGB triplet matching `color` (e.g. '232, 179, 57'). */
  rgb: string;
  /** Label text — rendered uppercase + monospaced. */
  eyebrow: string;
  /** Optional right-side slot (e.g. a small Pressable button). */
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 99,
          backgroundColor: color,
        }}
      />
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: '600',
          letterSpacing: 1.8,
          color,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </Text>
      <View style={{ flex: 1, height: 1 }}>
        <LinearGradient
          colors={[`rgba(${rgb}, 0.5)`, `rgba(${rgb}, 0)`]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>
      {action}
    </View>
  );
}

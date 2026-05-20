import { View } from 'react-native';

/** Rounded dark card surface. Optional left accent stripe.
 *
 *  `tone="black"` uses the slate `#10141B` surface (matches the new
 *  PremiumCard / InputCard aesthetic) with a 0.5px hairline white border.
 *  Used on the Status screen for the hero data cards so they sit on the
 *  same material as the rest of the app's premium chrome. Other screens
 *  keep the default raised-gray look. */
export function Card({
  children,
  accent,
  className,
  tone = 'default',
}: {
  children: React.ReactNode;
  accent?: 'green' | 'red' | 'amber';
  className?: string;
  tone?: 'default' | 'black';
}) {
  const accentClass =
    accent === 'green'
      ? 'border-l-[3px] border-l-risk-low'
      : accent === 'red'
        ? 'border-l-[3px] border-l-risk-extreme'
        : accent === 'amber'
          ? 'border-l-[3px] border-l-warn'
          : '';
  // Inline style for the surface — guarantees the bg renders opaquely (and
  // avoids NativeWind class-extraction quirks when toggling bg via a ternary).
  const surfaceStyle =
    tone === 'black'
      ? {
          backgroundColor: '#10141B', // slate `surface` — matches InputCard
          borderWidth: 0.5,
          borderColor: 'rgba(255,255,255,0.09)',
        }
      : { backgroundColor: '#1a1a1d' }; // ink-800 (legacy non-hero surface)
  return (
    <View
      style={surfaceStyle}
      className={`rounded-2xl p-5 ${accentClass} ${className ?? ''}`}
    >
      {children}
    </View>
  );
}

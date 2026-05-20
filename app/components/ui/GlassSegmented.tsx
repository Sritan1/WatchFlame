import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { tap } from '@/lib/haptics';

type Option<T extends string> = { id: T; label: string };

/**
 * Glassy segmented control — N options inside a dark glass pill, with the
 * active option filled in a colored gradient + soft outer glow.
 *
 * Matches the screens.jsx GlassSegmented primitive. Used on the Safety
 * screen to switch between "Away From Fire" / "Nearest Shelter" evac
 * modes; designed to read at a glance against the dark background.
 */
export function GlassSegmented<T extends string>({
  value,
  options,
  onChange,
  color,
  rgb,
  size = 'md',
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  /** Hex color for the active fill (e.g. '#fb923c'). */
  color: string;
  /** Comma-separated RGB triplet matching `color` (e.g. '251, 146, 60'). */
  rgb: string;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 32 : 38;
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.30)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              tap.selection();
              onChange(o.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              height: h,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {active ? (
              <LinearGradient
                colors={[`rgba(${rgb},0.95)`, `rgba(${rgb},0.72)`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '600',
                    letterSpacing: 1.5,
                    color: '#ffffff',
                    textTransform: 'uppercase',
                  }}
                >
                  {o.label}
                </Text>
              </LinearGradient>
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '600',
                    letterSpacing: 1.5,
                    color: '#6b7280',
                    textTransform: 'uppercase',
                  }}
                >
                  {o.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

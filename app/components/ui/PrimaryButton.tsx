import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'danger';

const variants: Record<Variant, { bg: string; text: string; iconColor: string }> = {
  primary:   { bg: 'bg-risk-low',    text: 'text-ink-950', iconColor: '#0a0a0b' },
  secondary: { bg: 'bg-ink-800',     text: 'text-chalk-50', iconColor: '#f8fafc' },
  danger:    { bg: 'bg-ember',       text: 'text-chalk-50', iconColor: '#f8fafc' },
};

/** Mockup-style large CTA button. "View Live Map" = primary, "Safety Action Plan" = secondary,
 *  "Emergency Support" / "Full Details" = danger. */
export function PrimaryButton({
  label,
  icon,
  onPress,
  variant = 'primary',
}: {
  label: string;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  onPress?: () => void;
  variant?: Variant;
}) {
  const v = variants[variant];
  return (
    <Pressable
      onPress={() => {
        tap.light();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`active:opacity-80 ${v.bg} flex-row items-center justify-center rounded-xl px-6 py-4`}
    >
      {icon ? (
        <View className="mr-3">
          <FontAwesome name={icon} size={18} color={v.iconColor} />
        </View>
      ) : null}
      <Text className={`text-base font-semibold ${v.text}`}>{label}</Text>
    </Pressable>
  );
}

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, Text, View } from 'react-native';

/** Inline error banner with a Retry CTA. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-risk-extreme/40 bg-risk-extreme/10 p-3">
      <View className="mr-3 flex-1 flex-row items-center">
        <FontAwesome name="exclamation-circle" size={14} color="#ef4444" />
        <Text className="ml-2 flex-1 text-sm text-risk-extreme">{message}</Text>
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityLabel="Retry"
          className="rounded-lg bg-risk-extreme/20 px-3 py-1.5"
        >
          <Text className="text-xs font-bold uppercase tracking-wider text-risk-extreme">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

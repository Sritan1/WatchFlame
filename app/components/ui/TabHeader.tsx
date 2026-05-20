import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';

/** Shared top header for tab screens — left = Settings, right = Locations. */
export function TabHeader() {
  return (
    <View className="flex-row items-center justify-between border-b border-ink-800 px-3 pb-3 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        hitSlop={12}
        onPress={() => {
          tap.light();
          router.push('/settings');
        }}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
      >
        <FontAwesome name="bars" size={20} color="#ef4444" />
      </Pressable>
      <Text className="text-base font-extrabold tracking-[3px] text-chalk-50">
        EMBER WATCH
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage saved locations"
        hitSlop={12}
        onPress={() => {
          tap.light();
          router.push('/locations');
        }}
        className="h-9 w-9 items-center justify-center rounded-full bg-ink-700 active:opacity-60"
      >
        <FontAwesome name="map-marker" size={14} color="#9ca3af" />
      </Pressable>
    </View>
  );
}

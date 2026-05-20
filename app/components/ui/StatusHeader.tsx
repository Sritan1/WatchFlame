import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';

/** Status-screen-specific top bar — minimal pin+location on the left, green
 *  dot + LIVE timestamp + settings gear on the right. Matches the home.jsx
 *  top bar.
 *
 *  Tapping the location chip opens the Locations screen.
 *  Tapping the gear icon opens Settings.
 */
export function StatusHeader({ locationLabel }: { locationLabel: string }) {
  const [time, setTime] = useState(() => formatHM(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(formatHM(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        height: 44,
      }}
    >
      <Pressable
        accessibilityLabel="Manage saved locations"
        hitSlop={8}
        onPress={() => {
          tap.light();
          router.push('/locations');
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <FontAwesome name="map-marker" size={12} color="#9ca3af" />
        <Text
          style={{ fontSize: 11, letterSpacing: 0.66, color: '#9ca3af' }}
          className="font-semibold uppercase"
        >
          {locationLabel}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 99,
              backgroundColor: '#3FB68B',
            }}
          />
          <Text
            style={{ fontSize: 10, letterSpacing: 0.8, color: '#6b7280' }}
            className="font-semibold uppercase"
          >
            Live · {time}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={12}
          onPress={() => {
            tap.light();
            router.push('/settings');
          }}
        >
          <FontAwesome name="cog" size={14} color="#9ca3af" />
        </Pressable>
      </View>
    </View>
  );
}

function formatHM(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const h12 = h % 12 || 12;
  return `${h12}:${m}`;
}

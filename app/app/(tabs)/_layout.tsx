import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

const ACTIVE = '#ef4444';   // ember red, matches mockup active-tab color
const INACTIVE = '#6b7280'; // muted

/** Active tab gets a soft red glow on its icon — gives the tab bar a hint
 *  of the same "lit instrument" feel as the rest of the UI without adding
 *  any chrome that competes with the screens. */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  focused: boolean;
}) {
  return (
    <View
      style={
        focused
          ? {
              shadowColor: ACTIVE,
              shadowOpacity: 0.55,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
            }
          : undefined
      }
    >
      <FontAwesome size={22} name={name} color={color} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          // Slate `bg` — matches the Safety / Risk screen base color so
          // the tab bar reads as part of the same material instead of a
          // separate near-black plate.
          backgroundColor: '#0B0E12',
          // 0.5px hairline border (the "line" token from the slate palette).
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 0.5,
          height: 78,
          paddingTop: 8,
          paddingBottom: 18,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'STATUS',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="th-large" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'MAP',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="map" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'SAFETY',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="shield" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="risk"
        options={{
          title: 'RISK',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="fire" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

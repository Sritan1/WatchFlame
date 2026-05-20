import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { api } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { GPS_LOCATION_ID, useSavedLocations } from '@/lib/locations';
import type { GeocodeHit } from '@/lib/types';

export default function LocationsScreen() {
  const { items, activeId, setActive, add, remove } = useSavedLocations();
  const [query, setQuery] = useState('');

  // Debounce-ish: only search when user taps Enter or ≥3 chars + 400ms idle.
  const search = useQuery({
    queryKey: ['geocode', query],
    queryFn: () => api.geocode(query),
    enabled: query.trim().length >= 3,
    staleTime: 5 * 60_000,
  });

  const onSelectGps = () => {
    tap.selection();
    setActive(GPS_LOCATION_ID);
  };

  const onSelectSaved = (id: string) => {
    tap.selection();
    setActive(id);
  };

  const onAdd = (hit: GeocodeHit) => {
    tap.success();
    const label = [hit.name, hit.state, hit.country].filter(Boolean).join(', ');
    const id = add({ label, lat: hit.lat, lon: hit.lon });
    setActive(id);
    setQuery('');
  };

  const onRemove = (id: string) => {
    tap.warning();
    remove(id);
  };

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      <StatusBar style="light" />
      <View className="flex-row items-center justify-between border-b border-ink-800 px-3 pb-3 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
        >
          <FontAwesome name="arrow-left" size={18} color="#ef4444" />
        </Pressable>
        <Text className="text-base font-extrabold tracking-[3px] text-chalk-50">
          LOCATIONS
        </Text>
        <View className="h-9 w-9" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="flex-1">
        <View className="px-6 pt-3">
          <Eyebrow>Active focus point</Eyebrow>
          <Text className="mt-1 text-sm text-chalk-400">
            Pick where Status, Map, and Safety should track. Use your phone&apos;s GPS or
            any saved city.
          </Text>

          {/* GPS row */}
          <View className="mt-4">
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: activeId === GPS_LOCATION_ID }}
              accessibilityLabel="Use my GPS location"
              onPress={onSelectGps}
              className="active:opacity-80"
            >
              <Card>
                <View className="flex-row items-center">
                  <FontAwesome
                    name={activeId === GPS_LOCATION_ID ? 'dot-circle-o' : 'circle-o'}
                    size={18}
                    color={activeId === GPS_LOCATION_ID ? '#7ee787' : '#9ca3af'}
                  />
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-bold text-chalk-50">My location</Text>
                    <Text className="mt-0.5 text-xs text-chalk-400">
                      Use the phone&apos;s GPS
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          </View>

          {/* Saved cities */}
          {items.length > 0 ? (
            <View className="mt-6">
              <Eyebrow>Saved cities</Eyebrow>
              <View className="mt-3 gap-2">
                {items.map((item) => {
                  const active = item.id === activeId;
                  return (
                    <View
                      key={item.id}
                      className="flex-row items-center overflow-hidden rounded-xl bg-ink-800"
                    >
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Use ${item.label}`}
                        onPress={() => onSelectSaved(item.id)}
                        className="flex-1 flex-row items-center p-4 active:opacity-80"
                      >
                        <FontAwesome
                          name={active ? 'dot-circle-o' : 'circle-o'}
                          size={18}
                          color={active ? '#7ee787' : '#9ca3af'}
                        />
                        <View className="ml-3 flex-1">
                          <Text className="text-base font-semibold text-chalk-50">
                            {item.label}
                          </Text>
                          <Text className="mt-0.5 text-[10px] uppercase tracking-[2px] text-chalk-500">
                            {item.lat.toFixed(2)}, {item.lon.toFixed(2)}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Remove ${item.label}`}
                        onPress={() => onRemove(item.id)}
                        hitSlop={8}
                        className="px-4 py-4 active:opacity-60"
                      >
                        <FontAwesome name="trash" size={14} color="#9ca3af" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Search */}
          <View className="mt-7">
            <Eyebrow>Add a city</Eyebrow>
            <View className="mt-3 flex-row items-center rounded-xl bg-ink-800 px-4 py-3">
              <FontAwesome name="search" size={14} color="#9ca3af" />
              <TextInput
                className="ml-2 flex-1 text-base text-chalk-50"
                placeholder="e.g. Boulder, San Francisco"
                placeholderTextColor="#6b7280"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="words"
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                  <FontAwesome name="times-circle" size={14} color="#6b7280" />
                </Pressable>
              ) : null}
            </View>

            {query.trim().length > 0 && query.trim().length < 3 ? (
              <Text className="mt-3 text-xs text-chalk-500">
                Type at least 3 characters to search.
              </Text>
            ) : null}

            {search.isFetching ? (
              <View className="mt-4 flex-row items-center">
                <ActivityIndicator size="small" color="#7ee787" />
                <Text className="ml-2 text-xs text-chalk-400">Searching…</Text>
              </View>
            ) : null}

            {search.isError ? (
              <Text className="mt-4 text-xs text-risk-extreme">
                Couldn&apos;t reach the geocoding service.
              </Text>
            ) : null}

            {search.data && search.data.length === 0 ? (
              <Text className="mt-4 text-xs text-chalk-400">No matches.</Text>
            ) : null}

            {search.data && search.data.length > 0 ? (
              <View className="mt-3 gap-2">
                {search.data.map((hit, i) => {
                  const label = [hit.name, hit.state, hit.country]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <Pressable
                      key={`${hit.lat}-${hit.lon}-${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${label}`}
                      onPress={() => onAdd(hit)}
                      className="flex-row items-center rounded-xl bg-ink-800 p-3 active:opacity-80"
                    >
                      <FontAwesome name="map-marker" size={14} color="#9ca3af" />
                      <View className="ml-3 flex-1">
                        <Text className="text-sm font-semibold text-chalk-50">{label}</Text>
                        <Text className="text-[10px] text-chalk-500">
                          {hit.lat.toFixed(2)}, {hit.lon.toFixed(2)}
                        </Text>
                      </View>
                      <FontAwesome name="plus" size={14} color="#7ee787" />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

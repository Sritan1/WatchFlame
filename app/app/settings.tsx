import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { tap } from '@/lib/haptics';
import { useUnits, type UnitPreferences } from '@/lib/units';

type SegmentOption<T extends string> = { value: T; label: string };

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl bg-ink-700 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            onPress={() => {
              tap.selection();
              onChange(opt.value);
            }}
            className={`flex-1 items-center rounded-lg py-2.5 ${active ? 'bg-ember' : ''}`}
          >
            <Text
              className={`text-xs font-semibold uppercase tracking-[2px] ${
                active ? 'text-chalk-50' : 'text-chalk-400'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Bullet({ title, body }: { title: string; body: string }) {
  return (
    <View className="flex-row">
      <Text className="mr-2 text-risk-extreme">●</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-chalk-50">{title}</Text>
        <Text className="mt-0.5 text-xs text-chalk-400">{body}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { units, setUnits } = useUnits();

  const update = <K extends keyof UnitPreferences>(key: K, value: UnitPreferences[K]) =>
    setUnits((prev) => ({ ...prev, [key]: value }));

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
          SETTINGS
        </Text>
        <View className="h-9 w-9" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="flex-1">
        <View className="px-6 pt-3">
          <Eyebrow>Units</Eyebrow>

          <View className="mt-4">
            <Card>
              <View className="mb-2 flex-row items-baseline justify-between">
                <Text className="text-base font-bold text-chalk-50">Temperature</Text>
                <Text className="text-xs text-chalk-400">currently {units.temp === 'C' ? '°C' : '°F'}</Text>
              </View>
              <Segment
                value={units.temp}
                options={[
                  { value: 'C', label: '°C' },
                  { value: 'F', label: '°F' },
                ]}
                onChange={(v) => update('temp', v)}
              />
            </Card>
          </View>

          <View className="mt-3">
            <Card>
              <View className="mb-2 flex-row items-baseline justify-between">
                <Text className="text-base font-bold text-chalk-50">Wind speed</Text>
                <Text className="text-xs text-chalk-400">currently {units.speed}</Text>
              </View>
              <Segment
                value={units.speed}
                options={[
                  { value: 'kph', label: 'kph' },
                  { value: 'mph', label: 'mph' },
                ]}
                onChange={(v) => update('speed', v)}
              />
            </Card>
          </View>

          <View className="mt-3">
            <Card>
              <View className="mb-2 flex-row items-baseline justify-between">
                <Text className="text-base font-bold text-chalk-50">Distance</Text>
                <Text className="text-xs text-chalk-400">currently {units.distance}</Text>
              </View>
              <Segment
                value={units.distance}
                options={[
                  { value: 'mi', label: 'miles' },
                  { value: 'km', label: 'km' },
                ]}
                onChange={(v) => update('distance', v)}
              />
            </Card>
          </View>

          <View className="mt-8">
            <Eyebrow tone="red" withDot>Important notice</Eyebrow>
            <View className="mt-3">
              <Card accent="red">
                <Text className="text-base font-extrabold text-chalk-50">
                  This is an informational tool, not an emergency service.
                </Text>
                <Text className="mt-3 text-sm text-chalk-100">
                  In an active emergency, call{' '}
                  <Text className="font-bold text-risk-extreme">911</Text> and follow
                  evacuation orders from local authorities. Do not rely on this app to
                  make life-safety decisions.
                </Text>

                <View className="mt-4 gap-3">
                  <Bullet
                    title="Cross-check with official sources"
                    body="The National Weather Service (weather.gov), your state forestry / Cal Fire site, ready.gov, and your county emergency-management office are authoritative. This app is not."
                  />
                  <Bullet
                    title="Detection delays exist"
                    body="NASA satellite detections (FIRMS) lag the real fire by 1–2 hours. Named-incident metadata from NIFC and Cal Fire is updated on each agency's own schedule and may also be delayed."
                  />
                  <Bullet
                    title="The risk score is an approximation"
                    body="A public-data fire-weather index calibrated against historical fire records. It is not a substitute for professional fire-weather services like the NWS Storm Prediction Center."
                  />
                  <Bullet
                    title="Shelters listed may not be activated"
                    body="Listings come from community-tagged OpenStreetMap data and the NCES public-school database. They are potential evacuation points — call ahead during a real emergency."
                  />
                  <Bullet
                    title="Project context"
                    body="This is a personal portfolio project, not a commercial product. There is no SLA, no guarantee of accuracy, and no on-call team."
                  />
                </View>
              </Card>
            </View>
          </View>

          <View className="mt-8">
            <Eyebrow>About</Eyebrow>
            <View className="mt-3">
              <Card>
                <Text className="text-xs text-chalk-400">
                  Real-time wildfire detection from NASA FIRMS · current conditions from
                  OpenWeatherMap · transparent rule-based fire weather index based on
                  Fosberg, Hot-Dry-Windy, and McArthur indices.
                </Text>
              </Card>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

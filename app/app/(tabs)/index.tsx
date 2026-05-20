import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Card } from '@/components/ui/Card';
import { DangerPill } from '@/components/ui/DangerPill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HeroOrb } from '@/components/ui/HeroOrb';
import { LocalKbdiCard } from '@/components/ui/LocalKbdiCard';
import { LocalNdviCard } from '@/components/ui/LocalNdviCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ShimmerPill } from '@/components/ui/ShimmerPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { StaggerHeadline } from '@/components/ui/StaggerHeadline';
import { StatusHeader } from '@/components/ui/StatusHeader';
import { WavesBackground } from '@/components/ui/WavesBackground';
import { cardinalFromBearing, WindDial } from '@/components/ui/WindDial';
import { bearingDeg, compassBearing } from '@/lib/geo';
import {
  useActiveLocation,
  useFiresAroundMe,
  useNearestFire,
  useRiskFromWeather,
  useWeather,
} from '@/lib/hooks';
import type { DangerLevel } from '@/lib/types';
import { distanceValue, formatSpeed, formatTemp, useUnits } from '@/lib/units';

// Weather-only headlines (no fire detected within NEARBY_DISTANCE_MI).
// The "Evacuate" and "Fire Detected" copy lives in the headline derivation
// below — both require an actual satellite detection within a real distance,
// not just an EXTREME weather score.
const LEVEL_HEADLINE: Record<DangerLevel, string[]> = {
  LOW:      ['No Nearby', 'Fires'],
  MODERATE: ['Smoke', 'Advisory'],
  HIGH:     ['Elevated', 'Fire Risk'],
  EXTREME:  ['Extreme Fire', 'Weather'],
};

const LEVEL_SUBTITLE: Record<DangerLevel, string> = {
  LOW:      'Conditions are calm. No active fires within 250 mi.',
  MODERATE: 'Air quality reduced. Stay informed for changes.',
  HIGH:     'Elevated fire weather in your area. No active fires nearby.',
  EXTREME:  'Extreme fire weather. Avoid outdoor ignition sources.',
};

// "Fire Detected Nearby" fires for any satellite detection inside this radius
// regardless of weather score — proximity alone is the lead fact. 20 mi ≈
// half-hour drive / smoke-detectable range; tight enough to stay actionable.
const NEARBY_DISTANCE_MI = 20;
// "Evacuate Immediately" requires BOTH a close fire AND extreme weather.
// Either alone is not enough — a distant fire on a calm day isn't an
// evacuation event, and extreme weather without a nearby fire is just
// dangerous conditions to avoid igniting.
const EVAC_DISTANCE_MI = 10;

export default function StatusScreen() {
  const loc = useActiveLocation();
  const fires = useFiresAroundMe(loc.coords);
  const nearest = useNearestFire(loc.coords, fires.data);
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data, loc.coords);
  const { units } = useUnits();

  const [refreshing, setRefreshing] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fires.refetch(), weather.refetch()]);
    await risk.refetch();
    setRefreshing(false);
  }, [fires, weather, risk]);

  const hasNearby = !!nearest && nearest.distance < NEARBY_DISTANCE_MI;
  const apiError = fires.isError || weather.isError;
  // Don't render hero text until fires + weather have resolved at least once.
  // Prevents the "No Nearby Fires" flash while data is in-flight.
  const heroReady = !fires.isLoading && fires.data !== undefined;

  // Effective level (regional preferred). Used for the orb arc length, the
  // compact pill color, the headline text, and the subtitle phrasing.
  const effectiveLevel: DangerLevel | null =
    risk.data?.regional_level ?? risk.data?.danger_level ?? null;

  // "Evacuate Immediately" is reserved for the genuine combination: a
  // satellite-detected fire within EVAC_DISTANCE_MI AND extreme weather
  // amplifying it. Extreme weather alone (no fire) or a distant fire
  // (no extreme weather) both downgrade to the next-most-honest framing.
  const hasImmediate =
    !!nearest && nearest.distance < EVAC_DISTANCE_MI && effectiveLevel === 'EXTREME';

  // Headline derivation, priority order:
  //   1. Close fire + extreme weather   → "Evacuate Immediately"
  //   2. Any fire within 50 mi          → "Fire Detected Nearby"
  //   3. Otherwise, level-driven copy   → weather-only headline
  const headlineLines: string[] = hasImmediate
    ? ['Evacuate', 'Immediately']
    : hasNearby
      ? ['Fire Detected', 'Nearby']
      : effectiveLevel
        ? LEVEL_HEADLINE[effectiveLevel]
        : ['Loading'];

  const subtitle: string = (() => {
    if (nearest && (hasImmediate || hasNearby)) {
      const d = distanceValue(nearest.distance, units.distance);
      const dir = compassBearing(
        bearingDeg(loc.coords, {
          lat: nearest.fire.properties.lat,
          lon: nearest.fire.properties.lon,
        }),
      );
      if (hasImmediate) {
        return `Active fire ${d.value} ${d.suffix} ${dir} of you with extreme fire weather. Leave now if you can.`;
      }
      return `Active fire ${d.value} ${d.suffix} ${dir} of you. Stay informed.`;
    }
    if (!effectiveLevel) return 'Reading conditions for your area…';
    return LEVEL_SUBTITLE[effectiveLevel];
  })();

  const headerLocationLabel = loc.isGps
    ? (weather.data?.location.name ?? loc.label)
    : loc.label;

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      <StatusBar style="light" />

      {/* Animated background — sits behind everything. */}
      <WavesBackground />

      <View style={{ flex: 1, zIndex: 1 }}>
        <StatusHeader locationLabel={headerLocationLabel} />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7ee787"
              colors={['#7ee787']}
            />
          }
        >
          <View className="px-6">
            {/* Hero orb — arc fills to the actual risk_score (0–1), color
             *  comes from the regional/national level. */}
            <View className="mt-3 items-center">
              <HeroOrb
                score={risk.data?.risk_score ?? null}
                level={effectiveLevel}
                thresholds={risk.data?.regional_thresholds ?? null}
              />
            </View>

            {/* Liquid-glass danger pill */}
            <View className="mt-1 items-center">
              {effectiveLevel ? (
                <ShimmerPill level={effectiveLevel} />
              ) : (
                <View className="h-7 w-24 rounded-full bg-ink-800/40" />
              )}
            </View>

            {/* Headline — keyed so stagger replays when state flips. */}
            <View className="mt-3 items-center">
              {!heroReady ? (
                <Skeleton width={'70%'} height={48} rounded="lg" />
              ) : (
                <StaggerHeadline
                  key={headlineLines.join('-')}
                  lines={headlineLines}
                  textClassName="text-center text-[38px] font-extrabold leading-tight text-chalk-50"
                />
              )}
            </View>

            {/* Subtitle */}
            {heroReady ? (
              <Text className="mt-2.5 px-4 text-center text-sm leading-snug text-chalk-400">
                {subtitle}
              </Text>
            ) : null}

            {/* Calibration hint — only when in a fitted state. */}
            {risk.data?.regional_level && risk.data?.regional_state ? (
              <Pressable
                onPress={() => setCalibrationOpen(true)}
                hitSlop={8}
                accessibilityLabel="What does calibrated for this state mean?"
                className="mt-3 flex-row items-center self-center"
              >
                <Text className="text-[10px] font-semibold uppercase tracking-[2.5px] text-chalk-500">
                  Calibrated for {risk.data.regional_state}
                  {risk.data.regional_level !== risk.data.danger_level
                    ? ` · national: ${risk.data.danger_level}`
                    : ''}
                </Text>
                <FontAwesome
                  name="question-circle"
                  size={10}
                  color="#6b7280"
                  style={{ marginLeft: 5 }}
                />
              </Pressable>
            ) : null}

          {/* CTAs */}
          <View className="mt-6 gap-3">
            <PrimaryButton
              label="View Live Map"
              icon="map"
              variant="primary"
              onPress={() => router.push('/map')}
            />
            <PrimaryButton
              label="Risk Calculator"
              icon="calculator"
              variant="secondary"
              onPress={() => router.push('/risk')}
            />
          </View>

          {/* Conditions card */}
          <View className="mt-6">
            <Card accent="green" tone="black">
              <View className="flex-row items-center">
                <FontAwesome name="thermometer-half" size={14} color="#fb923c" />
                <View className="ml-2">
                  <Eyebrow>Current conditions</Eyebrow>
                </View>
              </View>
              <View className="mt-4 flex-row gap-3">
                <WindTile
                  speed={weather.data ? formatSpeed(weather.data.wind_speed, units.speed) : null}
                  bearingDeg={weather.data?.wind_deg ?? null}
                />
                <ConditionTile
                  label="Temperature"
                  value={weather.data ? formatTemp(weather.data.temperature, units.temp) : null}
                />
              </View>
            </Card>
          </View>

          {/* Humidity card */}
          <View className="mt-4">
            <Card tone="black">
              <View className="flex-row items-center">
                <FontAwesome name="tint" size={14} color="#7ee787" />
                <View className="ml-2">
                  <Eyebrow>Humidity</Eyebrow>
                </View>
              </View>
              {weather.data ? (
                <AnimatedNumber
                  value={weather.data.humidity}
                  format={(n) => `${Math.round(n)}%`}
                  className="mt-3 text-4xl font-extrabold text-chalk-50"
                />
              ) : (
                <View className="mt-3">
                  <Skeleton width={120} height={40} rounded="md" />
                </View>
              )}
              {weather.data ? (
                <View className="mt-4 rounded-xl border border-risk-low/30 bg-risk-low/10 p-3">
                  <Text className="text-sm text-risk-low">
                    {weather.data.conditions
                      ? `Conditions: ${weather.data.conditions}.`
                      : 'Environmental conditions remain stable.'}
                  </Text>
                </View>
              ) : null}
            </Card>
          </View>

          {/* Your area today — real KBDI from the backend's drought lookup */}
          <View className="mt-4">
            <LocalKbdiCard
              kbdi={risk.data?.kbdi ?? null}
              regionalLevel={risk.data?.regional_level ?? null}
              regionalState={risk.data?.regional_state ?? null}
              isLoading={risk.isLoading}
            />
          </View>

          {/* Vegetation stress — NDVI anomaly from Sentinel-2 satellite */}
          <View className="mt-4">
            <LocalNdviCard
              ndviAnomaly={risk.data?.ndvi_anomaly ?? null}
              isLoading={risk.isLoading}
            />
          </View>

          {apiError && (
            <View className="mt-4">
              <ErrorBanner
                message={`Couldn't reach the API at ${process.env.EXPO_PUBLIC_API_URL}. Make sure the backend is running.`}
                onRetry={onRefresh}
              />
            </View>
          )}
        </View>
      </ScrollView>
      </View>

      <CalibrationModal
        visible={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        state={risk.data?.regional_state ?? null}
        regionalLevel={risk.data?.regional_level ?? null}
        nationalLevel={risk.data?.danger_level ?? null}
        ndviAnomaly={risk.data?.ndvi_anomaly ?? null}
      />
    </SafeAreaView>
  );
}

function CalibrationModal({
  visible,
  onClose,
  state,
  regionalLevel,
  nationalLevel,
  ndviAnomaly,
}: {
  visible: boolean;
  onClose: () => void;
  state: string | null;
  regionalLevel: string | null;
  nationalLevel: string | null;
  ndviAnomaly: number | null;
}) {
  const differs = regionalLevel != null && nationalLevel != null && regionalLevel !== nationalLevel;
  // NDVI anomaly thresholds for the human-readable label. Sign convention:
  // negative = drier/sparser than normal (raises risk).
  const ndviLabel: string | null =
    ndviAnomaly == null
      ? null
      : ndviAnomaly <= -0.10
        ? 'much drier than normal'
        : ndviAnomaly <= -0.03
          ? 'drier than normal'
          : ndviAnomaly < 0.03
            ? 'about normal'
            : ndviAnomaly < 0.10
              ? 'greener than normal'
              : 'much greener than normal';
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
        <View className="flex-row items-center justify-between border-b border-ink-800 px-5 pb-3 pt-2">
          <Text className="text-base font-extrabold tracking-[3px] text-chalk-50">
            REGIONAL CALIBRATION
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <FontAwesome name="times" size={20} color="#f8fafc" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-6">
          <Text className="mt-4 text-2xl font-extrabold text-chalk-50">
            Why &quot;HIGH&quot; means different things in different places
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            A risk score of 0.55 in Florida is genuinely a high-fire-risk day. The same
            0.55 in Arizona is fairly routine. A single global cutoff would cry wolf in
            one and miss real danger in the other.
          </Text>

          <Text className="mt-6 text-base font-bold text-chalk-50">How it works</Text>
          <Text className="mt-2 text-sm text-chalk-400">
            For each of <Text className="font-bold text-chalk-100">17 fitted states</Text>,
            we computed the algorithm&apos;s score on a sample of historical fire days
            from the federal Fire Program Analysis (FPA_FOD) database, then took the
            distribution&apos;s percentiles:
          </Text>
          <Text className="mt-3 rounded-xl bg-ink-800 p-3 font-mono text-xs leading-5 text-chalk-100">
            LOW       :  score &lt; 50th percentile{'\n'}
            MODERATE  :  50th – 75th percentile{'\n'}
            HIGH      :  75th – 97th percentile{'\n'}
            EXTREME   :  ≥ 97th percentile  (top ~3% of fire days)
          </Text>
          <Text className="mt-3 text-sm text-chalk-400">
            EXTREME means the conditions match the worst ~3% of days the state has
            historically seen actual fires on. It&apos;s a relative warning, calibrated
            against your state&apos;s real fire history — not an absolute score.
          </Text>

          {state ? (
            <View className="mt-6 rounded-xl border border-risk-low/30 bg-risk-low/5 p-4">
              <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-risk-low">
                Your area
              </Text>
              <Text className="mt-2 text-sm text-chalk-100">
                <Text className="font-bold">{state}</Text> is one of the 17 fitted
                states. The pill on the Status screen shows your{' '}
                <Text className="font-bold">regional</Text> level
                {regionalLevel ? ` (currently ${regionalLevel})` : ''}.
              </Text>
              {differs ? (
                <Text className="mt-2 text-xs text-chalk-400">
                  The national-level cutoffs would have called today{' '}
                  <Text className="font-semibold">{nationalLevel}</Text>. The regional
                  view is more honest about what counts as &quot;extreme&quot; where you live.
                </Text>
              ) : (
                <Text className="mt-2 text-xs text-chalk-400">
                  Today the regional and national cutoffs happen to agree.
                </Text>
              )}
            </View>
          ) : (
            <View className="mt-6 rounded-xl border border-ink-700 bg-ink-800 p-4">
              <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-chalk-400">
                Your area
              </Text>
              <Text className="mt-2 text-sm text-chalk-100">
                Your current location isn&apos;t in the 17 fitted states yet, so the pill
                shows the global cutoffs instead.
              </Text>
              <Text className="mt-2 text-xs text-chalk-400">
                Fitted states cover the highest-fire-risk regions in the US: most of the
                West, plus the Southeast belt. Adding more states is on the roadmap.
              </Text>
            </View>
          )}

          <Text className="mt-6 text-base font-bold text-chalk-50">
            Fitted states
          </Text>
          <Text className="mt-1 text-sm text-chalk-400">
            AZ, CA, CO, FL, GA, ID, MT, NC, NM, NV, OK, OR, SC, TX, UT, WA, WY.
          </Text>

          <Text className="mt-6 text-base font-bold text-chalk-50">
            Vegetation stress (NDVI)
          </Text>
          <Text className="mt-1 text-sm text-chalk-400">
            On top of the regional calibration, the score uses{' '}
            <Text className="font-bold text-chalk-100">live vegetation health</Text>{' '}
            from Sentinel-2 satellite imagery as a fuel-load signal. Specifically, the
            NDVI anomaly: how much drier or greener the vegetation in a 1 km buffer
            around you is right now versus the same calendar month averaged over the
            last three years (2023–2025). Negative = drier than normal (raises risk).
          </Text>
          {ndviAnomaly != null ? (
            <View className="mt-3 rounded-xl border border-risk-low/30 bg-risk-low/5 p-4">
              <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-risk-low">
                Current anomaly
              </Text>
              <Text className="mt-2 text-sm text-chalk-100">
                <Text className="font-bold">{ndviAnomaly >= 0 ? '+' : ''}{ndviAnomaly.toFixed(3)}</Text>
                {' '}— {ndviLabel}.
              </Text>
            </View>
          ) : (
            <Text className="mt-3 text-xs text-chalk-400">
              Satellite imagery unavailable right now (heavy cloud cover, ungeolocated, or
              outside Sentinel-2 coverage). Score falls back to a calendar-season multiplier.
            </Text>
          )}

          <Text className="mt-8 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs leading-5 text-chalk-400">
            <Text className="font-bold text-warn">Caveat. </Text>
            Calibration uses ~500-day samples per state from FPA_FOD. It captures the
            shape of fire-day weather but isn&apos;t the equivalent of a National Weather
            Service red-flag warning. See the disclaimer in Settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ConditionTile({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="flex-1 rounded-xl bg-ink-700 p-4">
      <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
        {label}
      </Text>
      {value ? (
        <Text className="mt-2 text-lg font-bold text-chalk-50">{value}</Text>
      ) : (
        <View className="mt-2">
          <Skeleton width={64} height={20} rounded="sm" />
        </View>
      )}
    </View>
  );
}

/** Wind ConditionTile variant — speed + cardinal label, with an animated
 *  WindDial in the top-right showing the direction the wind is coming FROM. */
function WindTile({ speed, bearingDeg }: { speed: string | null; bearingDeg: number | null }) {
  return (
    <View className="flex-1 rounded-xl bg-ink-700 p-4">
      <View className="flex-row items-start justify-between">
        <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
          Wind
        </Text>
        <WindDial bearingDeg={bearingDeg} size={36} />
      </View>
      {speed ? (
        <Text className="mt-2 text-lg font-bold text-chalk-50">{speed}</Text>
      ) : (
        <View className="mt-2">
          <Skeleton width={64} height={20} rounded="sm" />
        </View>
      )}
      {bearingDeg != null ? (
        <Text className="mt-1 text-[10px] font-semibold uppercase tracking-[2px] text-chalk-500">
          from {cardinalFromBearing(bearingDeg)}
        </Text>
      ) : null}
    </View>
  );
}

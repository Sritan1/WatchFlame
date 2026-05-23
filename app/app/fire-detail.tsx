import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { DangerPill } from '@/components/ui/DangerPill';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { SpreadArrow } from '@/components/ui/SpreadArrow';
import { StatCard } from '@/components/ui/StatCard';
import { bearingDeg, compassBearing, distanceMiles } from '@/lib/geo';
import { tap } from '@/lib/haptics';
import {
  useActiveLocation,
  useFiresNear,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useWeather,
} from '@/lib/hooks';
import { openLocationInMaps } from '@/lib/maps';
import { openExternalUrl } from '@/lib/openUrl';
import type { LatLon, NamedIncident } from '@/lib/types';
import { distanceValue, useUnits } from '@/lib/units';

export default function FireDetailScreen() {
  const params = useLocalSearchParams<{
    lat: string;
    lon: string;
    brightness?: string;
    confidence?: string;
    acq_date?: string;
    acq_time?: string;
    satellite?: string;
    daynight?: string;
  }>();

  const fireLat = parseFloat(params.lat ?? '0');
  const fireLon = parseFloat(params.lon ?? '0');
  const fireLoc: LatLon = { lat: fireLat, lon: fireLon };

  const me = useActiveLocation();
  const weather = useWeather(fireLoc);
  const risk = useRiskFromWeather(weather.data);
  const nearby = useFiresNear(fireLoc, 8, 7);
  const incidents = useNamedIncidentsNear(fireLoc, 10, 5);
  const { units } = useUnits();

  // Take the first (closest) match if any. Cal Fire wins ties because the
  // backend orders Cal Fire before NIFC during merge.
  const matched: NamedIncident | null = incidents.data?.[0] ?? null;
  // Suppress the layout flash: we don't know whether a named incident matches
  // until the query resolves, so render skeletons until then.
  const incidentResolved = !incidents.isLoading;

  const distFromMe = useMemo(
    () => (me.coords ? distanceMiles(me.coords, fireLoc) : null),
    [me.coords, fireLoc],
  );
  const bearingFromMe = useMemo(
    () => (me.coords ? compassBearing(bearingDeg(me.coords, fireLoc)) : null),
    [me.coords, fireLoc],
  );

  const detectionId = useMemo(() => {
    const date = (params.acq_date ?? 'unknown').replace(/-/g, '');
    const latH = `${Math.round(fireLat * 100)}`;
    const lonH = `${Math.round(fireLon * 100)}`;
    return `FIRMS-${date}-${latH}-${lonH}`;
  }, [params.acq_date, fireLat, fireLon]);

  const passes = useMemo(() => {
    if (!nearby.data) return [];
    return [...nearby.data.features]
      .sort((a, b) =>
        (b.properties.acq_date ?? '').localeCompare(a.properties.acq_date ?? '') ||
        (b.properties.acq_time ?? '').localeCompare(a.properties.acq_time ?? ''),
      )
      .slice(0, 8);
  }, [nearby.data]);

  const openInMaps = () => openLocationInMaps(fireLoc);

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      <StatusBar style="light" />
      <Header />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-6 pt-3">
          {!incidentResolved ? (
            <View className="gap-2">
              <Skeleton width={120} height={12} rounded="sm" />
              <Skeleton width={220} height={32} rounded="sm" />
              <Skeleton width={'90%'} height={36} rounded="sm" />
            </View>
          ) : (
            <>
              <View className="flex-row items-center justify-between">
                <Eyebrow tone="red" withDot>
                  {matched ? 'Active incident' : 'Live detection'}
                </Eyebrow>
                <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-500">
                  {matched ? matched.source.toUpperCase() : detectionId}
                </Text>
              </View>
              <Text className="mt-2 text-3xl font-extrabold text-chalk-50">
                {matched ? matched.name : 'Fire Detection'}
              </Text>
              <Text className="mt-2 text-sm text-chalk-400">
                {distFromMe != null && bearingFromMe
                  ? (() => {
                      const d = distanceValue(distFromMe, units.distance);
                      return `${d.value} ${d.suffix} ${bearingFromMe} of your location.`;
                    })()
                  : 'Active thermal anomaly detected by NASA satellite.'}
                {' '}
                {matched
                  ? `Reported by ${matched.agency ?? 'the responsible agency'}${
                      matched.started ? ` on ${formatDate(matched.started)}` : ''
                    }.`
                  : 'All metrics below are computed from real-time data — no named-incident match was found within 10 miles.'}
              </Text>
            </>
          )}

          {/* Stat grid: skeletons while we figure out matched/unmatched */}
          {!incidentResolved ? (
            <View className="mt-5 gap-3">
              <View className="flex-row gap-3">
                <Skeleton width={'48%'} height={88} rounded="md" />
                <Skeleton width={'48%'} height={88} rounded="md" />
              </View>
              <View className="flex-row gap-3">
                <Skeleton width={'48%'} height={88} rounded="md" />
                <Skeleton width={'48%'} height={88} rounded="md" />
              </View>
            </View>
          ) : (
            <>
              {/* Satellite detection cards — always shown when resolved */}
              <View className="mt-5 gap-3">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <RiskTile
                      level={risk.data?.danger_level}
                      loading={
                        weather.isLoading ||
                        risk.isLoading ||
                        (weather.data != null && risk.data == null)
                      }
                    />
                  </View>
                  <StatCard
                    label="Distance"
                    value={
                      distFromMe != null
                        ? distanceValue(distFromMe, units.distance).value
                        : '—'
                    }
                    unit={
                      distFromMe != null
                        ? distanceValue(distFromMe, units.distance).suffix
                        : undefined
                    }
                  />
                </View>
                {/* New: Threat to You — instant heuristic (distance + size). */}
                <RiskTile
                  label="Threat to You"
                  level={threatLevelFor(distFromMe, matched?.acres)}
                />
                <View className="flex-row gap-3">
                  <StatCard
                    label="Brightness"
                    value={
                      params.brightness
                        ? `${Math.round(Number(params.brightness))}`
                        : '—'
                    }
                    unit="K"
                  />
                  <StatCard
                    label="Confidence"
                    value={(params.confidence ?? '—').toUpperCase()}
                  />
                </View>
              </View>

              {/* Incident management cards — only when a named incident matches */}
              {matched ? (
                <View className="mt-5">
                  <Eyebrow>Incident facts</Eyebrow>
                  <View className="mt-3 gap-3">
                    <View className="flex-row gap-3">
                      <StatCard
                        label="Containment"
                        value={
                          matched.contained_pct != null
                            ? `${Math.round(matched.contained_pct)}`
                            : '—'
                        }
                        unit={matched.contained_pct != null ? '%' : undefined}
                      />
                      <StatCard
                        label="Size"
                        value={
                          matched.acres != null
                            ? matched.acres.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })
                            : '—'
                        }
                        unit={matched.acres != null ? 'ac' : undefined}
                        tone={(matched.acres ?? 0) > 1000 ? 'extreme' : 'default'}
                      />
                    </View>
                    <View className="flex-row gap-3">
                      <StatCard
                        label="Personnel"
                        value={
                          matched.personnel != null
                            ? matched.personnel.toString()
                            : '—'
                        }
                      />
                      <StatCard
                        label="Cause"
                        value={matched.cause ?? '—'}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {/* Incident details card (cause / agency / control statement / source link) */}
          {matched ? (
            <View className="mt-5">
              <Eyebrow>Incident details</Eyebrow>
              <Card className="mt-2">
                {matched.county ? <Row k="County" v={matched.county} /> : null}
                {matched.state && !matched.county ? (
                  <Row k="State" v={matched.state} />
                ) : null}
                {matched.location ? <Row k="Location" v={matched.location} /> : null}
                <Row k="Source" v={matched.source === 'calfire' ? 'Cal Fire' : 'NIFC WFIGS'} />
                {matched.control_statement ? (
                  <Text className="mt-3 text-xs text-chalk-100">
                    {matched.control_statement}
                  </Text>
                ) : null}
                {matched.url ? (
                  <Pressable
                    onPress={() => {
                      tap.light();
                      void openExternalUrl(matched.url!);
                    }}
                    className="mt-3 flex-row items-center"
                    accessibilityRole="link"
                    accessibilityLabel="Open official incident page"
                  >
                    <FontAwesome name="external-link" size={12} color="#7ee787" />
                    <Text className="ml-2 text-xs font-semibold text-risk-low">
                      Open official page
                    </Text>
                  </Pressable>
                ) : null}
              </Card>
            </View>
          ) : null}

          {/* Spread prediction card with mini map */}
          <View className="mt-5">
            <View className="flex-row items-baseline justify-between">
              <Eyebrow>Spread prediction</Eyebrow>
              {weather.data?.wind_deg != null ? (
                <Text className="text-[11px] text-chalk-500">
                  based on current local wind
                </Text>
              ) : null}
            </View>
            <View className="mt-2 overflow-hidden rounded-2xl border border-ink-700">
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ width: '100%', height: 220 }}
                initialRegion={{
                  latitude: fireLat,
                  longitude: fireLon,
                  latitudeDelta: 0.25,
                  longitudeDelta: 0.25,
                }}
                pitchEnabled={false}
                rotateEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                {/* This fire */}
                <Marker coordinate={{ latitude: fireLat, longitude: fireLon }}>
                  <View className="h-5 w-5 rounded-full border-2 border-white bg-risk-extreme" />
                </Marker>
                {/* Nearby cluster (active extent) */}
                {(nearby.data?.features ?? [])
                  .filter(
                    (f) =>
                      !(f.properties.lat === fireLat && f.properties.lon === fireLon),
                  )
                  .slice(0, 50)
                  .map((f, i) => (
                    <Marker
                      key={`near-${i}`}
                      coordinate={{
                        latitude: f.properties.lat,
                        longitude: f.properties.lon,
                      }}
                      tracksViewChanges={false}
                    >
                      <View className="h-2.5 w-2.5 rounded-full border border-white bg-risk-high" />
                    </Marker>
                  ))}
              </MapView>
              {/* Spread arrow overlay */}
              {weather.data?.wind_deg != null ? (
                <View className="absolute right-3 top-3">
                  <SpreadArrow
                    windDeg={weather.data.wind_deg}
                    windKph={weather.data.wind_speed}
                  />
                </View>
              ) : null}
            </View>
            <Text className="mt-2 text-xs text-chalk-400">
              {nearby.data
                ? `${nearby.data.features.length} thermal detections in the surrounding 8 miles over the last 7 days. Larger cluster = larger active fire footprint.`
                : 'Loading nearby detections…'}
            </Text>
          </View>

          {/* Recent passes timeline */}
          {passes.length > 1 ? (
            <View className="mt-5">
              <Eyebrow>Recent satellite passes</Eyebrow>
              <Card className="mt-2">
                <View className="gap-3">
                  {passes.map((p, i) => (
                    <View key={`pass-${i}`} className="flex-row items-center">
                      <View className="mr-3 h-2 w-2 rounded-full bg-risk-extreme" />
                      <Text className="text-sm text-chalk-50">
                        {p.properties.acq_date ?? 'unknown'}{' '}
                        {p.properties.acq_time
                          ? `${p.properties.acq_time.padStart(4, '0').slice(0, 2)}:${p.properties.acq_time.padStart(4, '0').slice(2)} UTC`
                          : ''}
                      </Text>
                      <Text className="ml-auto text-xs text-chalk-400">
                        sat {p.properties.satellite ?? '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
              <Text className="mt-2 text-xs text-chalk-400">
                Each entry is a satellite pass that flagged a hot pixel near here. Multiple
                passes over time → fire is persistent.
              </Text>
            </View>
          ) : null}

          {/* Detection metadata */}
          <View className="mt-5">
            <Eyebrow>Detection metadata</Eyebrow>
            <Card className="mt-2">
              <Row k="Detected" v={params.acq_date ?? '—'} />
              <Row k="Acquisition time" v={params.acq_time ? `${params.acq_time} UTC` : '—'} />
              <Row k="Satellite" v={params.satellite ?? '—'} />
              <Row k="Day / night" v={params.daynight === 'D' ? 'Day' : params.daynight === 'N' ? 'Night' : '—'} />
              <Row k="Latitude" v={fireLat.toFixed(4)} />
              <Row k="Longitude" v={fireLon.toFixed(4)} />
            </Card>
          </View>

          {/* CTAs */}
          <View className="mt-6 gap-3">
            <PrimaryButton
              label="Open in Maps"
              icon="external-link"
              variant="danger"
              onPress={openInMaps}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
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
        EMBER WATCH
      </Text>
      <View className="h-9 w-9" />
    </View>
  );
}

function RiskTile({
  label = 'Risk Level',
  level,
  loading = false,
}: {
  /** Tile heading. Defaults to "Risk Level" so existing call sites stay valid. */
  label?: string;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | undefined;
  /** True while /weather or /risk is still in flight. Cold fetches (Open-Meteo
   *  + KBDI history) can take several seconds; without a placeholder the tile
   *  shows a bare "—" that looks indistinguishable from "no data". */
  loading?: boolean;
}) {
  return (
    <View className="rounded-xl bg-ink-800 p-4">
      <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
        {label}
      </Text>
      <View className="mt-2">
        {loading ? (
          <Skeleton width={140} height={28} rounded="full" />
        ) : level ? (
          <DangerPill level={level} />
        ) : (
          <Text className="text-2xl font-bold text-chalk-400">—</Text>
        )}
      </View>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between border-b border-ink-700/50 py-2 last:border-0">
      <Text className="text-xs text-chalk-400">{k}</Text>
      <Text className="text-xs font-semibold text-chalk-50">{v}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Distance + size heuristic for "Threat to You" — answers
 *  "how scary is this fire to me", in contrast to RiskTile's "Risk Level"
 *  which is the fire weather (VPD/wind/drought) at the fire's location.
 *  Synchronous (no network) so it resolves instantly even while the
 *  fire-weather pill is still fetching. Identical breakpoints to the web's
 *  severityOf in components/status/ClosestFiresList.tsx. */
function threatLevelFor(
  distMi: number | null,
  acres: number | null | undefined,
): 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | undefined {
  if (distMi == null) return undefined;
  const a = acres ?? 0;
  if (distMi < 6 || a > 1000) return 'EXTREME';
  if (distMi < 12 || a > 300) return 'HIGH';
  if (distMi < 25 || a > 50) return 'MODERATE';
  return 'LOW';
}

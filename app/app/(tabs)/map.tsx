import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Minimum tap target — half of Apple HIG's 44pt accessibility minimum.
const MIN_TAP_RADIUS_PT = 22;

import { tap } from '@/lib/haptics';
import MapView, { Circle, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RadialGlow } from '@/components/ui/RadialGlow';
import { acresToRadiusMeters, distanceMiles, nearestFire } from '@/lib/geo';
import {
  useActiveLocation,
  useFiresAroundMe,
  useNamedIncidentsNear,
} from '@/lib/hooks';
import { useIntent } from '@/lib/intent';
import type { FireFeature, NamedIncident } from '@/lib/types';
import { formatDistance, useUnits } from '@/lib/units';

/** Smallest visible circle radius — small fires (< ~10 acres) would otherwise
 *  be invisible at typical zoom. */
const MIN_INCIDENT_RADIUS_M = 500;
/** Default radius when an incident has no acres reported. */
const DEFAULT_INCIDENT_ACRES = 100;

type SelectedItem =
  | { kind: 'fire'; fire: FireFeature }
  | { kind: 'incident'; incident: NamedIncident }
  | null;

const MAX_MARKERS = 200;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const loc = useActiveLocation();
  const fires = useFiresAroundMe(loc.coords);
  const incidents = useNamedIncidentsNear(loc.coords, 100, 30);
  const mapRef = useRef<MapView>(null);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const { units } = useUnits();
  const { pendingShowOnMap, consumeShowOnMap } = useIntent();
  // Track latitudeDelta so the hit-test can grow at zoomed-out levels where
  // a 500m circle is only a few screen pixels wide.
  const [latitudeDelta, setLatitudeDelta] = useState(4);
  // Set true the tick we successfully consume an intent. Prevents the next
  // run of the consolidated effect (triggered by pendingShowOnMap → false)
  // from falling into the "no intent" branch and clearing what we just set.
  const intentJustHandledRef = useRef(false);

  /** Pre-compute display radius for each incident so render + hit-test agree. */
  const incidentRender = useMemo(() => {
    return (incidents.data ?? []).map((inc) => ({
      incident: inc,
      radiusM: Math.max(
        acresToRadiusMeters(inc.acres ?? DEFAULT_INCIDENT_ACRES),
        MIN_INCIDENT_RADIUS_M,
      ),
    }));
  }, [incidents.data]);

  const ready = loc.permission !== 'pending';

  // Single consolidated effect for pan + autoselect.
  //
  // Priority on intent:
  //   1. Closest NAMED INCIDENT (NIFC / Cal Fire) — these are persistent and
  //      reflect official tracking. Preferred even when satellite has no
  //      recent FIRMS detections in the area.
  //   2. Closest FIRMS satellite detection.
  //   3. Just navigate (no selection). The empty-state card on the Map will
  //      tell the user nothing is detected.
  //
  // Otherwise (no intent): clear any open sheet and pan to user focus.
  useEffect(() => {
    if (pendingShowOnMap) {
      // Try named incident first
      if (incidents.data && incidents.data.length > 0) {
        const closestIncident = [...incidents.data].sort(
          (a, b) => a.distance_mi - b.distance_mi,
        )[0];
        intentJustHandledRef.current = true;
        consumeShowOnMap();
        setSelected({ kind: 'incident', incident: closestIncident });
        mapRef.current?.animateToRegion(
          {
            latitude: closestIncident.lat,
            longitude: closestIncident.lon,
            latitudeDelta: 1.5,
            longitudeDelta: 1.5,
          },
          700,
        );
        return;
      }
      // Fall back to FIRMS
      if (fires.data && fires.data.features.length > 0) {
        const near = nearestFire(loc.coords, fires.data.features);
        if (near) {
          intentJustHandledRef.current = true;
          consumeShowOnMap();
          setSelected({ kind: 'fire', fire: near.fire });
          mapRef.current?.animateToRegion(
            {
              latitude: near.fire.properties.lat,
              longitude: near.fire.properties.lon,
              latitudeDelta: 1.5,
              longitudeDelta: 1.5,
            },
            700,
          );
          return;
        }
      }
      // Neither — wait for either to resolve. The effect will re-fire when
      // incidents.data or fires.data changes. If both eventually resolve as
      // empty, we leave pendingShowOnMap set; the user can dismiss by clicking
      // the empty-state card or the back arrow.
      return;
    }

    // pendingShowOnMap is false. If we *just* consumed an intent above, this
    // re-fire is the synchronous follow-up — keep the selection and zoom we
    // just set, don't pan back out to the user.
    if (intentJustHandledRef.current) {
      intentJustHandledRef.current = false;
      return;
    }

    // Genuine "no intent" path: dismiss any open sheet + pan to active focus.
    setSelected(null);
    mapRef.current?.animateToRegion(
      {
        latitude: loc.coords.lat,
        longitude: loc.coords.lon,
        latitudeDelta: 4,
        longitudeDelta: 4,
      },
      700,
    );
  }, [
    pendingShowOnMap,
    fires.data,
    incidents.data,
    loc.coords.lat,
    loc.coords.lon,
    consumeShowOnMap,
  ]);

  // Cap markers so very dense days don't slow the map. Sort by brightness desc
  // so we keep the most significant detections.
  const visibleFires = useMemo(() => {
    if (!fires.data) return [];
    const all = fires.data.features;
    if (all.length <= MAX_MARKERS) return all;
    return [...all]
      .sort((a, b) => (b.properties.brightness ?? 0) - (a.properties.brightness ?? 0))
      .slice(0, MAX_MARKERS);
  }, [fires.data]);
  const truncated = (fires.data?.features.length ?? 0) > MAX_MARKERS;

  const recenter = () => {
    tap.light();
    mapRef.current?.animateToRegion(
      {
        latitude: loc.coords.lat,
        longitude: loc.coords.lon,
        latitudeDelta: 4,
        longitudeDelta: 4,
      },
      500,
    );
  };

  /** Recenter on the currently-selected fire/incident — used when the user
   *  taps the bottom-sheet body after panning the map away. */
  const recenterOnSelected = () => {
    if (!selected) return;
    tap.light();
    const target =
      selected.kind === 'fire'
        ? { lat: selected.fire.properties.lat, lon: selected.fire.properties.lon }
        : { lat: selected.incident.lat, lon: selected.incident.lon };
    mapRef.current?.animateToRegion(
      {
        latitude: target.lat,
        longitude: target.lon,
        latitudeDelta: 1.5,
        longitudeDelta: 1.5,
      },
      500,
    );
  };

  const manualRefresh = () => {
    tap.light();
    fires.refetch();
  };

  const openFireDetail = (fire: FireFeature) => {
    router.push({
      pathname: '/fire-detail',
      params: {
        lat: String(fire.properties.lat),
        lon: String(fire.properties.lon),
        brightness: fire.properties.brightness != null ? String(fire.properties.brightness) : '',
        confidence: fire.properties.confidence ?? '',
        acq_date: fire.properties.acq_date ?? '',
        acq_time: fire.properties.acq_time ?? '',
        satellite: fire.properties.satellite ?? '',
        daynight: fire.properties.daynight ?? '',
      },
    });
  };

  const openIncidentDetail = (inc: NamedIncident) => {
    // Fire-detail screen handles incidents-only (no FIRMS) gracefully —
    // satellite cards show "—" and the named-incident layout takes over.
    router.push({
      pathname: '/fire-detail',
      params: { lat: String(inc.lat), lon: String(inc.lon) },
    });
  };

  /** Hit-test the user's tap against incident circles. Fires when the user
   *  taps the map but NOT on a marker. Picks the nearest incident whose
   *  radius contains the tap.
   *
   *  Hit radius is the max of (display radius, zoom-aware floor). At state
   *  zoom (latitudeDelta ~4) a 500m circle is ~5 screen pixels wide; the
   *  floor expands the tap zone to ≥22 screen pixels (Apple HIG accessibility
   *  minimum) so the circle is still tappable. At city zoom the floor is
   *  smaller than the display radius, so big circles still win the hit-test
   *  the way they should. */
  const onMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const metersPerPixel = (latitudeDelta * 111_000) / SCREEN_HEIGHT;
    const minHitRadiusM = MIN_TAP_RADIUS_PT * metersPerPixel;

    let bestInc: NamedIncident | null = null;
    let bestDistM = Infinity;
    for (const { incident, radiusM } of incidentRender) {
      const distMi = distanceMiles(
        { lat: latitude, lon: longitude },
        { lat: incident.lat, lon: incident.lon },
      );
      const distM = distMi * 1609.34;
      const hitRadius = Math.max(radiusM, minHitRadiusM);
      if (distM <= hitRadius && distM < bestDistM) {
        bestInc = incident;
        bestDistM = distM;
      }
    }
    if (bestInc) {
      tap.selection();
      // Toggle: tapping the same incident again dismisses the sheet.
      const sameSelected =
        selected?.kind === 'incident' && selected.incident.id === bestInc.id;
      setSelected(sameSelected ? null : { kind: 'incident', incident: bestInc });
    } else if (selected) {
      // Tap on empty map dismisses any open sheet
      setSelected(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0E12' }}>
      <StatusBar style="light" />

      <View style={{ flex: 1 }}>
        {!ready && (
          <View className="absolute inset-0 z-10 items-center justify-center bg-ink-950">
            <ActivityIndicator color="#7ee787" />
            <Text className="mt-3 text-xs uppercase tracking-[2px] text-chalk-400">
              Locating you…
            </Text>
          </View>
        )}
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: loc.coords.lat,
            longitude: loc.coords.lon,
            latitudeDelta: 4,
            longitudeDelta: 4,
          }}
          showsUserLocation={loc.isGps && loc.permission === 'granted'}
          showsMyLocationButton={false}
          onPress={onMapPress}
          onRegionChangeComplete={(r) => setLatitudeDelta(r.latitudeDelta)}
        >
          {/* Named incident footprints — translucent red circles sized by acres.
           *  Selected incident gets a brighter fill + stroke so the user has
           *  visual feedback for the active selection. The tap target itself
           *  is handled by the zoom-aware hit-test in onMapPress, which keeps
           *  even very small circles accessible at zoomed-out levels. */}
          {incidentRender.map(({ incident, radiusM }) => {
            const isSelected =
              selected?.kind === 'incident' && selected.incident.id === incident.id;
            return (
              <Circle
                key={`inc-${incident.id}`}
                center={{ latitude: incident.lat, longitude: incident.lon }}
                radius={radiusM}
                fillColor={isSelected ? 'rgba(239, 68, 68, 0.42)' : 'rgba(239, 68, 68, 0.22)'}
                strokeColor={isSelected ? 'rgba(239, 68, 68, 1)' : 'rgba(239, 68, 68, 0.7)'}
                strokeWidth={isSelected ? 3 : 2}
              />
            );
          })}

          {/* FIRMS satellite detections — small dots */}
          {visibleFires.map((f, i) => (
            <Marker
              key={`${f.properties.lat}-${f.properties.lon}-${i}`}
              coordinate={{ latitude: f.properties.lat, longitude: f.properties.lon }}
              onPress={() => {
                tap.selection();
                setSelected({ kind: 'fire', fire: f });
              }}
              tracksViewChanges={false}
            >
              <View className="h-4 w-4 rounded-full border-2 border-white bg-risk-extreme" />
            </Marker>
          ))}
        </MapView>

        {/* Top scrim — anchors floating chrome on a soft fade so the chips
         *  don't collide visually with the map tiles. Reaches just past the
         *  counter tile so the gradient never abruptly cuts. */}
        <LinearGradient
          colors={['rgba(11, 14, 18, 0.85)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 160,
          }}
        />

        {/* Bottom scrim — same idea on the bottom edge so the tab bar's
         *  underside meets a fade rather than a hard map cutoff. */}
        <LinearGradient
          colors={['transparent', 'rgba(11, 14, 18, 0.80)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 120,
          }}
        />

        {/* Floating header — Settings cog (left) + Locations pin (right).
         *  No brand label: on the map screen, the map IS the screen, and a
         *  giant "EMBER WATCH" wordmark would just steal pixels. */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
          }}
        >
          <GlassChip
            icon="bars"
            iconColor="#ef4444"
            accessibilityLabel="Open settings"
            onPress={() => {
              tap.light();
              router.push('/settings');
            }}
          />
          <GlassChip
            icon="map-marker"
            iconColor="#9ca3af"
            accessibilityLabel="Manage saved locations"
            onPress={() => {
              tap.light();
              router.push('/locations');
            }}
          />
        </View>

        {/* Counter tile — composed glass card with both layer counts.
         *  Empty state (no fires AND no incidents resolved yet) is handled
         *  by the loading pill / empty-state PremiumCard below. */}
        {((fires.data && fires.data.features.length > 0) ||
          (incidents.data && incidents.data.length > 0)) && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: insets.top + 60,
              left: 16,
              maxWidth: 260,
            }}
          >
            <CounterTile
              fireCount={fires.data?.features.length ?? 0}
              incidentCount={incidents.data?.length ?? 0}
              truncated={truncated}
              maxMarkers={MAX_MARKERS}
            />
          </View>
        )}

        {/* Loading pill — slate chrome, matches the header chips */}
        {fires.isLoading && (
          <View
            style={{
              position: 'absolute',
              top: insets.top + 60,
              right: 16,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: '#10141B',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.09)',
            }}
          >
            <ActivityIndicator size="small" color="#7ee787" />
            <Text className="ml-2 text-[11px] font-semibold uppercase tracking-[2px] text-chalk-100">
              Loading fires…
            </Text>
          </View>
        )}

        {/* Empty state — PremiumCard, risk-low green tint. */}
        {fires.data && fires.data.features.length === 0 && !fires.isLoading &&
          (!incidents.data || incidents.data.length === 0) && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: insets.top + 60,
                left: 16,
                right: 16,
              }}
            >
              <PremiumCard
                rgb="126, 231, 135"
                accentColor="#7ee787"
                padding={14}
                textureOpacity={0}
                glowIntensity={0.14}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: '#24322A',
                      borderWidth: 0.5,
                      borderColor: 'rgba(126, 231, 135, 0.30)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FontAwesome name="check-circle" size={16} color="#7ee787" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="text-sm font-bold text-chalk-50">No active fires</Text>
                    <Text className="mt-0.5 text-xs text-chalk-400">
                      NASA satellites haven&apos;t detected any thermal anomalies within
                      250 mi. Tap refresh to re-check.
                    </Text>
                  </View>
                </View>
              </PremiumCard>
            </View>
          )}

        {/* Command rail — three floating pills for recenter / refresh / help.
         *  When fire/incident data is present, the counter tile (top-left)
         *  is narrow and the right side is empty — rail tucks high. When
         *  there's no data, the empty-state PremiumCard ("No active fires")
         *  spans full width across the top, so the rail drops below it to
         *  avoid overlap. */}
        <View
          style={{
            position: 'absolute',
            top:
              (fires.data?.features.length ?? 0) > 0 ||
              (incidents.data?.length ?? 0) > 0
                ? insets.top + 80
                : insets.top + 180,
            right: 16,
          }}
        >
          <CommandRail
            onRecenter={recenter}
            onRefresh={manualRefresh}
            onHelp={() => {
              tap.light();
              setExplainerOpen(true);
            }}
            isFetching={fires.isFetching}
          />
        </View>

        {fires.isError && (
          <View className="absolute inset-x-3 bottom-3">
            <ErrorBanner
              message="Couldn't load fire data. Pull to retry."
              onRetry={() => fires.refetch()}
            />
          </View>
        )}

        {/* Bottom sheet — FIRMS satellite detection. PremiumCard with no
         *  texture — FIRMS is a passive sensor feed, so the chrome stays
         *  quieter than the "official" stripe texture used on incidents. */}
        {selected?.kind === 'fire' && (
          <Pressable
            onPress={recenterOnSelected}
            accessibilityHint="Recenter map on this fire"
            style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}
          >
            <PremiumCard
              rgb="239, 68, 68"
              accentColor="#ef4444"
              padding={18}
              textureOpacity={0}
              glowPosition="topRight"
              glowIntensity={0.18}
            >
              <View className="flex-row items-start justify-between">
                <View>
                  <Eyebrow tone="red" withDot>Live detection</Eyebrow>
                  <Text className="mt-1 text-xl font-bold text-chalk-50">
                    Satellite fire pixel
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelected(null)}
                  hitSlop={12}
                  accessibilityLabel="Close detection details"
                >
                  <FontAwesome name="times" size={18} color="#9ca3af" />
                </Pressable>
              </View>
              <View className="mt-4 flex-row gap-3">
                <Field
                  label="Distance"
                  value={formatDistance(
                    distanceMiles(loc.coords, {
                      lat: selected.fire.properties.lat,
                      lon: selected.fire.properties.lon,
                    }),
                    units.distance,
                  )}
                />
                <Field
                  label="Brightness"
                  value={
                    selected.fire.properties.brightness
                      ? `${Math.round(selected.fire.properties.brightness)}K`
                      : '—'
                  }
                />
                <Field
                  label="Confidence"
                  value={(selected.fire.properties.confidence ?? '—').toUpperCase()}
                />
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="flex-1 text-xs text-chalk-400">
                  Detected {selected.fire.properties.acq_date ?? 'recently'} by NASA{' '}
                  {selected.fire.properties.satellite ?? 'satellite'}
                </Text>
                <Pressable onPress={() => setExplainerOpen(true)} hitSlop={8}>
                  <Text className="ml-3 text-xs font-semibold text-risk-low">
                    What do these mean?
                  </Text>
                </Pressable>
              </View>
              <View className="mt-4">
                <PrimaryButton
                  label="Full Details"
                  icon="info-circle"
                  variant="danger"
                  onPress={() => openFireDetail(selected.fire)}
                />
              </View>
            </PremiumCard>
          </Pressable>
        )}

        {/* Bottom sheet — named active incident. PremiumCard with the
         *  `stripe` texture (mirrors the FEMA card) since incidents come
         *  from official agency feeds. */}
        {selected?.kind === 'incident' && (
          <Pressable
            onPress={recenterOnSelected}
            accessibilityHint="Recenter map on this incident"
            style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}
          >
            <PremiumCard
              rgb="239, 68, 68"
              accentColor="#ef4444"
              padding={18}
              texture="stripe"
              textureOpacity={0.04}
              glowPosition="topRight"
              glowIntensity={0.18}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Eyebrow tone="red" withDot>
                    {selected.incident.source === 'calfire' ? 'Cal Fire incident' : 'Active incident'}
                  </Eyebrow>
                  <Text className="mt-1 text-xl font-bold text-chalk-50" numberOfLines={2}>
                    {selected.incident.name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelected(null)}
                  hitSlop={12}
                  accessibilityLabel="Close incident details"
                >
                  <FontAwesome name="times" size={18} color="#9ca3af" />
                </Pressable>
              </View>
              <View className="mt-4 flex-row gap-3">
                <Field
                  label="Distance"
                  value={formatDistance(
                    distanceMiles(loc.coords, {
                      lat: selected.incident.lat,
                      lon: selected.incident.lon,
                    }),
                    units.distance,
                  )}
                />
                <Field
                  label="Size"
                  value={
                    selected.incident.acres != null
                      ? `${selected.incident.acres.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })} ac`
                      : '—'
                  }
                />
                <Field
                  label="Contained"
                  value={
                    selected.incident.contained_pct != null
                      ? `${Math.round(selected.incident.contained_pct)}%`
                      : '—'
                  }
                />
              </View>
              {(selected.incident.acres == null ||
                selected.incident.contained_pct == null) && (
                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 10,
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.09)',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    padding: 12,
                  }}
                >
                  <Text className="text-[11px] leading-4 text-chalk-400">
                    <Text className="font-bold text-chalk-50">Limited data. </Text>
                    This is a managed wildfire incident — not a single satellite
                    detection. Size and containment are reported by{' '}
                    {selected.incident.agency ?? 'the managing agency'} and may
                    not have been published yet.
                  </Text>
                </View>
              )}
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="flex-1 text-xs text-chalk-400">
                  {selected.incident.agency ? `Reported by ${selected.incident.agency}` : 'Officially tracked'}
                  {selected.incident.county ? ` · ${selected.incident.county} County` : ''}
                  {selected.incident.state ? `, ${selected.incident.state}` : ''}
                </Text>
                <Pressable onPress={() => setExplainerOpen(true)} hitSlop={8}>
                  <Text className="ml-3 text-xs font-semibold text-risk-low">
                    What is this?
                  </Text>
                </Pressable>
              </View>
              <View className="mt-4">
                <PrimaryButton
                  label="Full Details"
                  icon="info-circle"
                  variant="danger"
                  onPress={() => openIncidentDetail(selected.incident)}
                />
              </View>
            </PremiumCard>
          </Pressable>
        )}
      </View>

      <FireFieldsExplainerModal
        visible={explainerOpen}
        onClose={() => setExplainerOpen(false)}
      />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
        {label}
      </Text>
      <Text className="mt-1 text-base font-bold text-chalk-50">{value}</Text>
    </View>
  );
}

/** Circular glass chip — slate surface + hairline border. Used for the
 *  floating Settings / Locations buttons in the map's top corners. */
function GlassChip({
  icon,
  iconColor,
  accessibilityLabel,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  iconColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#10141B',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.09)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <FontAwesome name={icon} size={16} color={iconColor} />
    </Pressable>
  );
}

/** Composed glass tile showing the FIRMS + tracked-incident counts.
 *  Replaces the two loose unicode-glyph counter pills with a single card
 *  that uses real colored View markers + a hairline divider — same chrome
 *  language as the InputCards on Risk and Safety. */
function CounterTile({
  fireCount,
  incidentCount,
  truncated,
  maxMarkers,
}: {
  fireCount: number;
  incidentCount: number;
  truncated: boolean;
  maxMarkers: number;
}) {
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: '#10141B',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.09)',
        overflow: 'hidden',
      }}
    >
      {fireCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {/* Solid red dot — mirrors the FIRMS marker on the map */}
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#ef4444',
            }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.4,
              color: '#f1f5f9',
              textTransform: 'uppercase',
            }}
          >
            {fireCount} satellite {fireCount === 1 ? 'pixel' : 'pixels'}
            {truncated ? ` · top ${maxMarkers}` : ''}
          </Text>
        </View>
      ) : null}
      {fireCount > 0 && incidentCount > 0 ? (
        <View
          style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' }}
        />
      ) : null}
      {incidentCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {/* Red ring — mirrors the tracked-incident circle on the map */}
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.18)',
            }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.4,
              color: '#f1f5f9',
              textTransform: 'uppercase',
            }}
          >
            {incidentCount} tracked {incidentCount === 1 ? 'incident' : 'incidents'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Right-side control rail — three icon buttons unified inside a custom
 *  stadium-shaped (pill) card. Inlined rather than using PremiumCard so we
 *  can drop the top accent stripe and round the corners to match the rail
 *  width (creates a stadium / lozenge shape distinct from any other card
 *  in the app). Uses Feather icons (cleaner stroke-based set) instead of
 *  FontAwesome's classic solid glyphs. */
function CommandRail({
  onRecenter,
  onRefresh,
  onHelp,
  isFetching,
}: {
  onRecenter: () => void;
  onRefresh: () => void;
  onHelp: () => void;
  isFetching: boolean;
}) {
  // borderRadius = half the card width (60 button + 20 padding = 80pt wide).
  // Match the outer shadow host's borderRadius so the cast shadow has the
  // same rounded shape as the visible card.
  const RADIUS = 40;
  return (
    <View
      style={{
        borderRadius: RADIUS,
        backgroundColor: '#10141B',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 10,
      }}
    >
      <View
        style={{
          borderRadius: RADIUS,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: 'rgba(255,255,255,0.28)',
        }}
      >
        {/* Slate gradient surface */}
        <LinearGradient
          colors={['#161B24', '#10141B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Soft white corner halo — signature premium chrome (no top
         *  stripe per request). Position pulled tighter to a small rail. */}
        <RadialGlow
          rgb="255, 255, 255"
          size={180}
          intensity={0.16}
          style={{ position: 'absolute', top: -60, right: -60 }}
        />
        <View style={{ padding: 10 }}>
          <RailButton
            icon="navigation"
            iconColor="#f8fafc"
            accessibilityLabel="Recenter map on my location"
            onPress={onRecenter}
          />
          <RailDivider />
          <RailButton
            icon="refresh-cw"
            iconColor={isFetching ? '#7ee787' : '#f8fafc'}
            accessibilityLabel="Refresh fire data"
            onPress={onRefresh}
          />
          <RailDivider />
          <RailButton
            icon="help-circle"
            iconColor="#f8fafc"
            accessibilityLabel="What's on this map?"
            onPress={onHelp}
          />
        </View>
      </View>
    </View>
  );
}

function RailDivider() {
  return (
    <View
      style={{
        height: 0.5,
        marginVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.20)',
      }}
    />
  );
}

function RailButton({
  icon,
  iconColor,
  accessibilityLabel,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Feather name={icon} size={22} color={iconColor} />
    </Pressable>
  );
}

function FireFieldsExplainerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
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
            WHAT&apos;S ON THIS MAP
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <FontAwesome name="times" size={20} color="#f8fafc" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-6">
          <Text className="mt-4 text-2xl font-extrabold text-chalk-50">
            Two layers, two sources
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            The map fuses two independent feeds. They answer different questions, so an
            area might have one without the other.
          </Text>

          <View className="mt-6 gap-5">
            {/* Live detections (FIRMS) */}
            <View className="rounded-xl bg-ink-800 p-4">
              <View className="flex-row items-center">
                <View className="mr-3 h-4 w-4 rounded-full border-2 border-white bg-risk-extreme" />
                <Text className="text-base font-extrabold text-chalk-50">
                  Red dots — live satellite detections
                </Text>
              </View>
              <Text className="mt-2 text-sm text-chalk-400">
                Each dot is a thermal anomaly detected by NASA&apos;s VIIRS instrument
                aboard the Suomi-NPP and NOAA-20 polar-orbiting satellites. They answer:
                {' '}<Text className="italic text-chalk-100">where is something hot
                burning right now?</Text>
              </Text>
              <Text className="mt-2 text-[11px] text-chalk-500">
                Source: NASA FIRMS · 1–2 hour latency · updated every 5 minutes
                {'\n'}Caveats: nighttime cloud cover blocks detection; sun glint and hot
                rooftops can occasionally trigger low-confidence false positives.
              </Text>
            </View>

            {/* Tracked incidents (NIFC + Cal Fire) */}
            <View className="rounded-xl bg-ink-800 p-4">
              <View className="flex-row items-center">
                <View
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.22)',
                    borderColor: 'rgba(239, 68, 68, 0.7)',
                    borderWidth: 2,
                  }}
                  className="mr-3 h-4 w-4 rounded-full"
                />
                <Text className="text-base font-extrabold text-chalk-50">
                  Red circles — tracked incidents
                </Text>
              </View>
              <Text className="mt-2 text-sm text-chalk-400">
                Each translucent red circle is a named, managed wildfire incident
                published by an official agency (NIFC nationally, Cal Fire in
                California). They answer: <Text className="italic text-chalk-100">what
                fires are firefighters actively responding to?</Text> Circle radius
                scales with reported acres.
              </Text>
              <Text className="mt-2 text-[11px] text-chalk-500">
                Sources: NIFC WFIGS · Cal Fire incidents API · updated every 15 minutes
                {'\n'}Caveats: agency reporting cadence varies; size and containment may
                lag the on-the-ground reality by hours or longer.
              </Text>
            </View>

            {/* Why both */}
            <View className="rounded-xl bg-ink-700 p-4">
              <Text className="text-sm font-bold text-chalk-50">Why show both?</Text>
              <Text className="mt-1 text-sm text-chalk-400">
                A satellite dot can appear before any agency has officially named the
                incident — useful for very fresh ignitions. A tracked incident can exist
                without nearby satellite dots — common when smoke or cloud cover blocks
                the satellite view, or when a fire has stopped emitting strong heat but
                is still being managed.
              </Text>
            </View>
          </View>

          <Text className="mt-10 text-2xl font-extrabold text-chalk-50">
            What the satellite numbers mean
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            Three attributes describe how confident NASA is and how strong the thermal
            signal was for each red-dot detection.
          </Text>

          <View className="mt-6 gap-5">
            <Item
              title="Brightness (Kelvin)"
              body="Brightness temperature of the pixel in the satellite's mid-infrared band. Land background reads ~280–295 K. A small fire pushes a pixel to ~310 K. A large active wildfire can reach 360–400 K+. Higher means a stronger thermal signature, not literally the fire's air temperature."
            />
            <Item
              title="Confidence"
              body="VIIRS classifies each detection as L (low), N (nominal — most common), or H (high). N is the default 'trust this' tier — about 80%+ of detections. L means borderline (could be sun glint, hot rooftop, or a small real fire). H is almost certainly a real, hot fire."
            />
            <Item
              title="Distance"
              body="Great-circle distance from your current location to the fire pixel, in miles. Computed locally; not from the API."
            />
            <Item
              title="Detected by … satellite"
              body={
                'Which polar-orbiting satellite saw it: Suomi-NPP (label "N") or NOAA-20/JPSS-1 ("1"). Both carry the VIIRS instrument and pass over each spot 1–2 times per day.'
              }
            />
          </View>

          <Text className="mt-8 rounded-xl border border-risk-extreme/30 bg-risk-extreme/5 p-3 text-xs leading-5 text-chalk-400">
            <Text className="font-bold text-risk-extreme">Reminder. </Text>
            This map is for awareness only. Always cross-check with your local emergency
            management agency and the National Weather Service before acting.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <View>
      <Text className="text-base font-bold text-chalk-50">{title}</Text>
      <Text className="mt-1 text-sm text-chalk-400">{body}</Text>
    </View>
  );
}

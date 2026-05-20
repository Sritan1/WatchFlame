import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { CompassRose } from '@/components/ui/CompassRose';
import { DisasterBanner } from '@/components/ui/DisasterBanner';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ProgressArc } from '@/components/ui/ProgressArc';
import { RadialGlow } from '@/components/ui/RadialGlow';
import { SectionRibbon } from '@/components/ui/SectionRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabHeader } from '@/components/ui/TabHeader';
import { WarningBanner } from '@/components/ui/WarningBanner';
import { useChecklist } from '@/lib/checklist';
import { planEvacuation, planShelterRoute } from '@/lib/evacuation';
import { tap } from '@/lib/haptics';
import {
  useActiveDisasters,
  useActiveLocation,
  useFiresAroundMe,
  useNearbyShelters,
  useNearestFire,
  useRiskFromWeather,
  useWeather,
} from '@/lib/hooks';
import { openDirectionsInMaps, openLocationInMaps } from '@/lib/maps';
import type { DangerLevel } from '@/lib/types';
import { formatDistance, useUnits } from '@/lib/units';

const CHECKLIST = [
  { id: 'go_bag', label: "Pack emergency 'Go Bag'" },
  { id: 'devices', label: 'Charge all mobile devices' },
  { id: 'windows', label: 'Close all windows and doors' },
  { id: 'gutters', label: 'Clear leaves from gutters' },
  { id: 'pets', label: 'Confirm pets and family contacts' },
  { id: 'meds', label: 'Gather essential medications' },
];

type EvacMode = 'away' | 'shelter';

const AMBER = '#e8b339';
const AMBER_RGB = '232, 179, 57';
// Shelter accent — risk-low green. Used for the "Closest Potential Shelter"
// premium card chrome (border tint, top stripe, corner halo, CTA color)
// because a shelter is the positive/safe destination, not a threat.
const SHELTER_GREEN = '#7ee787';
const SHELTER_GREEN_RGB = '126, 231, 135';

// Upper bound of the proximity-meter scale on the Closest Active Fire
// card. The card itself shows whenever any fire is detected; this constant
// only governs the 6-bar meter visualization. 50 mi roughly covers
// "could-still-affect-me-via-smoke" distance — fires beyond this all
// light the leftmost (shortest) bar.
const PROXIMITY_METER_MAX_MI = 50;

const LEVEL_PALETTE: Record<DangerLevel, { color: string; rgb: string }> = {
  LOW:      { color: '#7ee787', rgb: '126, 231, 135' },
  MODERATE: { color: '#e8b339', rgb: '232, 179, 57' },
  HIGH:     { color: '#fb923c', rgb: '251, 146, 60' },
  EXTREME:  { color: '#ef4444', rgb: '239, 68, 68' },
};

export default function SafetyScreen() {
  const loc = useActiveLocation();
  const fires = useFiresAroundMe(loc.coords);
  const nearest = useNearestFire(loc.coords, fires.data);
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data);

  const [mode, setMode] = useState<EvacMode>('away');
  const [shelterInfoOpen, setShelterInfoOpen] = useState(false);
  const shelters = useNearbyShelters(loc.coords, 50, 20);
  const disasters = useActiveDisasters(loc.coords);

  const level: DangerLevel = risk.data?.danger_level ?? 'LOW';
  const palette = LEVEL_PALETTE[level];
  const checklist = useChecklist(CHECKLIST.map((c) => c.id));
  const checkedCount = Object.values(checklist.state).filter(Boolean).length;
  const { units } = useUnits();

  const evac = planEvacuation(loc.coords, fires.data?.features);
  const shelterPlan = planShelterRoute(loc.coords, shelters.data);

  // The "Action Checklist" ribbon switches to the high-risk color tone when
  // we're in EXTREME/HIGH territory, mirroring screens.jsx behavior.
  const checklistRibbon =
    level === 'EXTREME' || level === 'HIGH' ? palette : { color: '#f25c44', rgb: '242, 92, 68' };

  const openAwayRoute = () => {
    tap.light();
    if (!evac) {
      openLocationInMaps(loc.coords, 'My location');
      return;
    }
    openDirectionsInMaps(evac.origin, evac.destination);
  };

  const openShelterRoute = () => {
    tap.light();
    if (!shelterPlan) return;
    openDirectionsInMaps(shelterPlan.origin, shelterPlan.destination);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0E12' }} edges={['top']}>
      <StatusBar style="light" />

      {/* Subtle warm vignette top-right — replaces the prior green sanctuary
       *  glow with a single soft amber halo that echoes the FEMA card's
       *  accent and matches the screens.jsx ScreenVignette pattern. */}
      <RadialGlow
        rgb={AMBER_RGB}
        size={320}
        intensity={0.18}
        style={{ position: 'absolute', top: -60, right: -80 }}
      />

      <View style={{ flex: 1, zIndex: 1 }}>
        <TabHeader />
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Section: Safety Center */}
          <View style={{ marginTop: 18 }}>
            <SectionRibbon color={AMBER} rgb={AMBER_RGB} eyebrow="Safety Center" />
          </View>

          {/* FEMA premium card (when active for the user's county).
           *  When FEMA is the hero, the WarningBanner below stays compact.
           *  When FEMA isn't shown, the WarningBanner promotes itself to
           *  the premium hero variant so the page always has a real lead
           *  card instead of just a small advisory strip. */}
          {disasters.data?.county && disasters.data.active.length > 0 ? (
            <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
              <DisasterBanner
                disasters={disasters.data.active}
                countyName={disasters.data.county.name}
                state={disasters.data.county.state}
              />
            </View>
          ) : null}

          {/* Safety status advisory — Status-driven palette + loading state.
           *  Becomes the page hero when FEMA isn't active. */}
          {(() => {
            const femaActive =
              !!disasters.data?.county && disasters.data.active.length > 0;
            return (
              <View
                style={{
                  paddingHorizontal: 16,
                  marginTop: femaActive ? 12 : 18,
                }}
              >
                <WarningBanner
                  level={level}
                  isLoading={risk.isLoading}
                  premium={!femaActive}
                />
              </View>
            );
          })()}

          {/* Closest active fire stat with mini bar visualization. Always
           *  rendered (once fires has resolved); when no fire is detected
           *  the value reads "None detected" and the meter sits fully dim. */}
          {fires.data ? (
            <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
              <ClosestFirePill
                distanceMi={nearest?.distance ?? null}
                unit={units.distance}
                color={palette.color}
                rgb={palette.rgb}
              />
            </View>
          ) : null}

          {/* Section: Immediate Preparation */}
          <View style={{ marginTop: 32 }}>
            <SectionRibbon
              color={checklistRibbon.color}
              rgb={checklistRibbon.rgb}
              eyebrow={`Action Checklist · ${checkedCount}/${CHECKLIST.length} Complete`}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginTop: 14,
              gap: 16,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 28,
                fontWeight: '800',
                color: checklistRibbon.color,
                lineHeight: 30,
              }}
            >
              Immediate Preparation
            </Text>
            <ProgressArc
              value={checkedCount}
              total={CHECKLIST.length}
              color={checklistRibbon.color}
              size={92}
            />
          </View>

          {/* Checklist with index badges + thicker glowing checkboxes */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <ChecklistCard
              items={CHECKLIST}
              checkedMap={checklist.state}
              onToggle={(id) => checklist.toggle(id)}
              activeColor={checklistRibbon.color}
              activeRgb={checklistRibbon.rgb}
            />
            {checkedCount > 0 ? (
              <Pressable
                onPress={checklist.reset}
                hitSlop={8}
                style={{ alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 4 }}
              >
                <Text className="text-xs font-semibold text-chalk-400">Reset</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Section: Evacuation Routes */}
          <View
            style={{
              paddingHorizontal: 16,
              marginTop: 32,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 4,
              }}
            >
              <FontAwesome name="location-arrow" size={18} color="#4FA8FF" />
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#f8fafc' }}>
                Evacuation Routes
              </Text>
            </View>
            <View style={{ marginTop: 14 }}>
              <GlassSegmented
                value={mode}
                onChange={setMode}
                color={palette.color}
                rgb={palette.rgb}
                options={[
                  { id: 'away', label: 'Away From Fire' },
                  { id: 'shelter', label: 'Nearest Shelter' },
                ]}
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            {mode === 'away' ? (
              <AwayCard
                evac={evac}
                isLoading={fires.isLoading && !fires.data}
                color={palette.color}
                rgb={palette.rgb}
                distanceUnit={units.distance}
                onOpenRoute={openAwayRoute}
              />
            ) : (
              <ShelterCard
                shelters={shelters}
                shelterPlan={shelterPlan}
                distanceUnit={units.distance}
                onOpenRoute={openShelterRoute}
                onOpenInfo={() => setShelterInfoOpen(true)}
              />
            )}
          </View>
        </ScrollView>
      </View>

      <ShelterInfoModal
        visible={shelterInfoOpen}
        onClose={() => setShelterInfoOpen(false)}
      />
    </SafeAreaView>
  );
}

/** "Closest Active Fire" stat row — flame tile + label + distance + mini
 *  proximity meter. The 6 bars ramp small-to-tall left-to-right.
 *
 *  Meter states:
 *    - `distanceMi == null` (no fire detected)  → all bars dim
 *    - `distanceMi <  PROXIMITY_METER_MAX_MI`   → exactly one bar lit,
 *      farther → leftmost shorter, closer → rightmost taller
 *    - `distanceMi >= PROXIMITY_METER_MAX_MI`   → clamped to leftmost
 *      shortest bar ("detected but past the meter range")
 */
function ClosestFirePill({
  distanceMi,
  unit,
  color,
  rgb,
}: {
  distanceMi: number | null;
  unit: 'mi' | 'km';
  color: string;
  rgb: string;
}) {
  const NUM_BARS = 6;
  const binWidth = PROXIMITY_METER_MAX_MI / NUM_BARS;
  let litIndex: number;
  if (distanceMi == null) {
    litIndex = -1; // no fire → no bar lit
  } else if (distanceMi >= PROXIMITY_METER_MAX_MI) {
    litIndex = 0; // beyond meter range → leftmost (shortest) bar lit
  } else {
    litIndex = NUM_BARS - 1 - Math.floor(distanceMi / binWidth);
  }
  // Linear ramp from 10px (leftmost / farthest) to 36px (rightmost / closest).
  const heights = [10, 15, 20, 26, 31, 36];
  return (
    <View
      style={{
        backgroundColor: '#10141B',
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: `rgba(${rgb}, 0.08)`,
          borderWidth: 0.5,
          borderColor: `rgba(${rgb}, 0.25)`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesome name="fire" size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>{distanceMi != null ? 'Closest Active Fire' : 'No Fires'}</Eyebrow>
        {distanceMi != null ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: 16,
              fontWeight: '800',
              color: '#f8fafc',
            }}
          >
            {formatDistance(distanceMi, unit).replace(/[^\d.]/g, '')}{' '}
            <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '400' }}>
              {unit} away
            </Text>
          </Text>
        ) : (
          <Text
            style={{
              marginTop: 3,
              fontSize: 16,
              fontWeight: '800',
              color: '#9ca3af',
            }}
          >
            None detected
          </Text>
        )}
      </View>
      <View
        style={{
          width: 56,
          height: 36,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 2.5,
        }}
      >
        {heights.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 1,
              backgroundColor: i === litIndex ? color : `rgba(${rgb}, 0.2)`,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** Premium checklist card — numbered rows separated by hairline dividers,
 *  thicker checkboxes that fill in the active color when checked.
 *
 *  Note on layout: we wrap the row content in an inner View (rather than
 *  styling the Pressable directly) because Pressable's style-function
 *  pattern doesn't reliably apply flexDirection on all RN versions, and
 *  we use explicit `marginLeft` instead of `gap` for the same reason. */
function ChecklistCard({
  items,
  checkedMap,
  onToggle,
  activeColor,
}: {
  items: { id: string; label: string }[];
  checkedMap: Record<string, boolean>;
  onToggle: (id: string) => void;
  activeColor: string;
  activeRgb: string;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.09)',
        position: 'relative',
      }}
    >
      {/* Slate gradient surface — surface2 → surface, matches the FEMA /
       *  Suggested Direction cards so all premium tiles read as the same
       *  material. */}
      <LinearGradient
        colors={['#161B24', '#10141B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {items.map((item, i) => {
        const checked = !!checkedMap[item.id];
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              tap.light();
              onToggle(item.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={item.label}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 52,
                paddingHorizontal: 16,
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: 'rgba(255,255,255,0.06)',
              }}
            >
              {/* Index badge — mono numeric on the left, dimmer until checked */}
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '700',
                  letterSpacing: 0.6,
                  color: checked ? activeColor : '#4b5563',
                  width: 20,
                  textAlign: 'right',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </Text>
              {/* Checkbox — fills with the active color when checked */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  marginLeft: 12,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: checked ? activeColor : 'rgba(255,255,255,0.22)',
                  backgroundColor: checked ? activeColor : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {checked ? (
                  <FontAwesome name="check" size={12} color="#ffffff" />
                ) : null}
              </View>
              {/* Label — takes remaining width, single line */}
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  marginLeft: 12,
                  fontSize: 14,
                  color: checked ? '#6b7280' : '#f8fafc',
                  textDecorationLine: checked ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Premium "Suggested Direction" / "No active threats" / loading card.
 *  Renders the compass rose + big "Head X" heading + route description +
 *  Get Directions CTA when an evacuation plan exists. */
function AwayCard({
  evac,
  isLoading,
  color,
  rgb,
  distanceUnit,
  onOpenRoute,
}: {
  evac: ReturnType<typeof planEvacuation>;
  isLoading: boolean;
  color: string;
  rgb: string;
  distanceUnit: 'mi' | 'km';
  onOpenRoute: () => void;
}) {
  if (isLoading) {
    return (
      <PremiumCard rgb={rgb} accentColor={color}>
        <Skeleton width={140} height={12} rounded="sm" />
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Skeleton width={108} height={108} rounded="full" />
          <View style={{ flex: 1, gap: 10 }}>
            <Skeleton width={'70%'} height={36} rounded="md" />
            <Skeleton width={'90%'} height={12} rounded="sm" />
          </View>
        </View>
        <View style={{ marginTop: 18 }}>
          <Skeleton width={'100%'} height={12} rounded="sm" />
        </View>
      </PremiumCard>
    );
  }
  if (!evac) {
    return (
      <Card tone="black">
        <Eyebrow>No active threats</Eyebrow>
        <Text className="mt-2 text-base font-bold text-chalk-50">
          No fires within 20 miles
        </Text>
        <Text className="mt-1 text-xs text-chalk-400">
          The &quot;away from fire&quot; mode activates only when there&apos;s a
          detected fire nearby. Switch to &quot;Nearest shelter&quot; for a static
          evacuation point in your area.
        </Text>
      </Card>
    );
  }
  return (
    <PremiumCard rgb={rgb} accentColor={color}>
      {/* Eyebrow */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.6,
            color,
            textTransform: 'uppercase',
          }}
        >
          Suggested Direction
        </Text>
      </View>

      {/* Compass + heading */}
      <View
        style={{
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <CompassRose
          color={color}
          rgb={rgb}
          bearingDeg={evac.awayBearingDeg}
          size={108}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 44,
              fontWeight: '800',
              letterSpacing: -1.4,
              color: '#f8fafc',
              lineHeight: 42,
            }}
          >
            Head {evac.awayCardinal}
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: '#9ca3af',
              letterSpacing: 0.3,
              lineHeight: 16,
            }}
          >
            Routing {formatDistance(evac.evacuationDistanceMi, distanceUnit)} away · fire is{' '}
            {evac.fireCardinal} at {formatDistance(evac.fireDistanceMi, distanceUnit)}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={{ marginTop: 18, height: 1 }}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.16)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>

      <Text style={{ marginTop: 14, fontSize: 13, lineHeight: 20, color: '#9ca3af' }}>
        Suggestion only — targets a point{' '}
        {formatDistance(evac.evacuationDistanceMi, distanceUnit)} in the opposite
        direction of the nearest detected fire. Your phone&apos;s maps app figures
        out actual roads. Always follow official guidance from local authorities.
      </Text>

      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          label="Get Directions"
          icon="external-link"
          variant="danger"
          onPress={onOpenRoute}
        />
      </View>
    </PremiumCard>
  );
}

/** Nearest-shelter card — mirrors the AwayCard premium chrome (slate
 *  gradient + top glow stripe + grid texture + soft corner halo + compass
 *  rose) but tinted green because a shelter is the positive destination
 *  rather than a threat. Loading state uses the same skeleton-inside-
 *  premium-card pattern as AwayCard; error / empty states stay as simpler
 *  Cards so they read clearly differently from the success state. */
function ShelterCard({
  shelters,
  shelterPlan,
  distanceUnit,
  onOpenRoute,
  onOpenInfo,
}: {
  shelters: ReturnType<typeof useNearbyShelters>;
  shelterPlan: ReturnType<typeof planShelterRoute>;
  distanceUnit: 'mi' | 'km';
  onOpenRoute: () => void;
  onOpenInfo: () => void;
}) {
  if (shelters.isLoading) {
    return (
      <PremiumCard rgb={SHELTER_GREEN_RGB} accentColor={SHELTER_GREEN}>
        <Skeleton width={180} height={12} rounded="sm" />
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Skeleton width={108} height={108} rounded="full" />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={'85%'} height={20} rounded="md" />
            <Skeleton width={'60%'} height={20} rounded="md" />
            <Skeleton width={'90%'} height={12} rounded="sm" />
          </View>
        </View>
        <View style={{ marginTop: 18 }}>
          <Skeleton width={'100%'} height={12} rounded="sm" />
        </View>
      </PremiumCard>
    );
  }
  if (shelters.isError) {
    return (
      <Card tone="black">
        <Eyebrow tone="red" withDot>Couldn&apos;t load shelters</Eyebrow>
        <Text className="mt-2 text-xs text-chalk-400">
          Make sure the backend is running. Pull-to-refresh the Status tab to retry.
        </Text>
      </Card>
    );
  }
  if (!shelterPlan) {
    return (
      <Card tone="black">
        <Eyebrow>No shelters listed</Eyebrow>
        <Text className="mt-2 text-base font-bold text-chalk-50">
          No public-facing shelters within 50 miles
        </Text>
        <Text className="mt-1 text-xs text-chalk-400">
          Sources: OpenStreetMap community-tagged assembly points and community centres.
          US only. In a real emergency, follow official guidance from your county
          emergency-management office.
        </Text>
      </Card>
    );
  }
  return (
    <PremiumCard rgb={SHELTER_GREEN_RGB} accentColor={SHELTER_GREEN}>
      {/* Eyebrow */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: SHELTER_GREEN,
          }}
        />
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.6,
            color: SHELTER_GREEN,
            textTransform: 'uppercase',
          }}
        >
          Closest Potential Shelter
        </Text>
      </View>

      {/* Compass + name composition. Shelter name can be long, so the
       *  heading is 22px (not 44 like "Head N") and clamped to 2 lines. */}
      <View
        style={{
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <CompassRose
          color={SHELTER_GREEN}
          rgb={SHELTER_GREEN_RGB}
          bearingDeg={shelterPlan.bearingDeg}
          size={108}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{
              fontSize: 22,
              fontWeight: '800',
              letterSpacing: -0.5,
              color: '#f8fafc',
              lineHeight: 26,
            }}
          >
            {shelterPlan.shelter.name}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 11.5,
              color: '#9ca3af',
              letterSpacing: 0.3,
              lineHeight: 16,
            }}
          >
            {shelterPlan.shelter.type} · {shelterPlan.cardinal} at{' '}
            {formatDistance(shelterPlan.distanceMi, distanceUnit)}
          </Text>
          {shelterPlan.shelter.address ? (
            <Text
              numberOfLines={2}
              style={{
                marginTop: 4,
                fontSize: 11,
                color: '#6b7280',
                lineHeight: 14,
              }}
            >
              {shelterPlan.shelter.address}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Divider — same gradient hairline as AwayCard */}
      <View style={{ marginTop: 18, height: 1 }}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.16)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>

      {/* Disclaimer + "What is this?" link — preserved from prior design */}
      <View
        style={{
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: '#9ca3af' }}>
          <Text style={{ fontWeight: 'bold', color: '#e5e7eb' }}>Potential</Text>{' '}
          evacuation point — not necessarily activated for this event. Always
          call ahead during an emergency.
        </Text>
        <Pressable
          onPress={onOpenInfo}
          hitSlop={8}
          accessibilityLabel="What does potential shelter mean?"
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: SHELTER_GREEN,
            }}
          >
            What is this?
          </Text>
        </Pressable>
      </View>

      {/* Button — primary (green) variant, opens Apple Maps directions */}
      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          label="Get Directions"
          icon="external-link"
          variant="primary"
          onPress={onOpenRoute}
        />
      </View>
    </PremiumCard>
  );
}

function ShelterInfoModal({
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0E12' }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              letterSpacing: 3,
              color: '#f8fafc',
              textTransform: 'uppercase',
            }}
          >
            About These Shelters
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <FontAwesome name="times" size={20} color="#f8fafc" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-6">
          <Text className="mt-4 text-2xl font-extrabold text-chalk-50">
            Potential vs. activated
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            The most important distinction to understand before you rely on this list.
          </Text>

          <View className="mt-6 gap-4">
            <View
              style={{
                borderRadius: 12,
                padding: 14,
                backgroundColor: '#10141B',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.09)',
              }}
            >
              <Text className="text-base font-extrabold text-chalk-50">
                Potential shelter (what we show)
              </Text>
              <Text className="mt-2 text-sm text-chalk-400">
                A location someone has tagged as a possible assembly point — community
                centers, schools, government buildings — but that has{' '}
                <Text className="italic">not</Text> necessarily been opened for the
                current event. The building may be locked, may have no staff, and may
                not even be aware it&apos;s listed.
              </Text>
            </View>
            <View
              style={{
                borderRadius: 12,
                padding: 14,
                backgroundColor: '#10141B',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.09)',
              }}
            >
              <Text className="text-base font-extrabold text-chalk-50">
                Activated shelter (not yet shown)
              </Text>
              <Text className="mt-2 text-sm text-chalk-400">
                A facility officially opened by an agency (Red Cross, county
                emergency-management, FEMA) for a specific declared event. These have
                staff, supplies, and known intake hours. The app will overlay these in a
                future release once the data integration lands.
              </Text>
            </View>
          </View>

          <Text className="mt-8 text-2xl font-extrabold text-chalk-50">
            Where the data comes from
          </Text>

          <View className="mt-4 gap-5">
            <ModalItem
              title="OpenStreetMap (community-tagged)"
              body={
                'Anyone can tag a location in OpenStreetMap with amenity=shelter, emergency=assembly_point, or amenity=community_centre. Quality varies wildly by region — dense in some metros, sparse in rural areas. Tags can be stale or aspirational.'
              }
            />
            <ModalItem
              title="NCES Public Schools"
              body={
                'The National Center for Education Statistics maintains a directory of every public school in the US. We include schools because they are the most common emergency-shelter activation site in CONUS — but a listed school is just a building, not an activated shelter. During an event, only the schools your local emergency-management office has actually opened will be staffed.'
              }
            />
          </View>

          <Text className="mt-8 text-2xl font-extrabold text-chalk-50">
            What to do in a real emergency
          </Text>
          <View className="mt-3 gap-2">
            <Text className="text-sm text-chalk-400">
              <Text className="font-bold text-chalk-50">1. </Text>
              Call your <Text className="font-semibold text-chalk-100">county
              emergency-management office</Text> for the list of activated shelters.
            </Text>
            <Text className="text-sm text-chalk-400">
              <Text className="font-bold text-chalk-50">2. </Text>
              Visit <Text className="font-semibold text-chalk-100">redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter</Text>
              {' '}for Red Cross-operated shelters.
            </Text>
            <Text className="text-sm text-chalk-400">
              <Text className="font-bold text-chalk-50">3. </Text>
              Follow your <Text className="font-semibold text-chalk-100">local news
              and official social media</Text> for evacuation announcements.
            </Text>
            <Text className="text-sm text-chalk-400">
              <Text className="font-bold text-chalk-50">4. </Text>
              <Text className="font-semibold text-chalk-100">Call ahead.</Text>{' '}
              Even an activated shelter can fill up or change hours. Confirm before
              driving.
            </Text>
          </View>

          <Text className="mt-8 rounded-xl border border-risk-extreme/30 bg-risk-extreme/5 p-3 text-xs leading-5 text-chalk-400">
            <Text className="font-bold text-risk-extreme">Reminder. </Text>
            In an active emergency, dial <Text className="font-bold text-chalk-50">911
            </Text> first. This app supplements, never replaces, official guidance.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ModalItem({ title, body }: { title: string; body: string }) {
  return (
    <View>
      <Text className="text-base font-bold text-chalk-50">{title}</Text>
      <Text className="mt-1 text-sm text-chalk-400">{body}</Text>
    </View>
  );
}

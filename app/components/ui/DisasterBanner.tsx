import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { useIntent } from '@/lib/intent';
import { openExternalUrl } from '@/lib/openUrl';
import type { ActiveDisaster } from '@/lib/types';

import { StripePattern } from './PremiumCard';
import { RadialGlow } from './RadialGlow';

const AMBER = '#e8b339';
const AMBER_RGB = '232, 179, 57';

const DECL_TYPE_LABEL: Record<string, string> = {
  DR: 'Major disaster',
  EM: 'Emergency declaration',
  FM: 'Fire management',
};

/**
 * Premium federal-alert card. Shown when at least one FEMA-declared active
 * disaster covers the user's county.
 *
 * Visual treatment (screens.jsx-matched):
 *   - Linear-gradient surface, amber hairline border, top glow stripe
 *   - Diagonal stripe pattern for "official" texture + corner radial glow
 *   - Large rounded-square warning icon with pulse ring
 *   - 24px display title (FM-5632 · Fire), amber mono subtitle (COW CREEK)
 *   - Two amber buttons in a 2-col grid: Show on Map + FEMA page
 *
 * Behavior is unchanged from the prior version — same intent dispatch, same
 * openExternalUrl call, same accessibility labels.
 */
export function DisasterBanner({
  disasters,
  countyName,
  state,
}: {
  disasters: ActiveDisaster[];
  countyName: string;
  state: string;
}) {
  const { requestShowOnMap } = useIntent();

  if (disasters.length === 0) return null;
  const top = disasters[0];
  const more = disasters.length - 1;
  const typeLabel = DECL_TYPE_LABEL[top.declaration_type] ?? top.declaration_type;
  const incidentLabel = top.incident_type || typeLabel;

  const openOfficialPage = () => {
    if (!top.url) return;
    tap.light();
    void openExternalUrl(top.url);
  };

  const showOnMap = () => {
    tap.light();
    requestShowOnMap();
    router.push('/(tabs)/map');
  };

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: `rgba(${AMBER_RGB}, 0.28)`,
      }}
    >
      {/* Surface gradient (surface2 → surface) — slate-dark tones matching
       *  the screens.jsx aesthetic. */}
      <LinearGradient
        colors={['#161B24', '#10141B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Top glow stripe */}
      <View style={{ height: 3 }}>
        <LinearGradient
          colors={['transparent', AMBER, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>

      {/* Diagonal stripe texture */}
      <StripePattern color={AMBER} opacity={0.04} />

      {/* Corner radial glow — soft SVG halo. Intensity matches the screens.jsx
       *  amber stop (rgba(amberRgb, 0.18)). */}
      <RadialGlow
        rgb={AMBER_RGB}
        size={180}
        intensity={0.18}
        style={{ position: 'absolute', top: -40, right: -40 }}
      />

      <View style={{ padding: 18 }}>
        {/* Eyebrow row */}
        <Pressable
          onPress={openOfficialPage}
          accessibilityRole={top.url ? 'link' : undefined}
          accessibilityLabel={`FEMA ${typeLabel}: ${top.title}. Open official page.`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: AMBER,
              }}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.6,
                color: AMBER,
                textTransform: 'uppercase',
              }}
            >
              FEMA Active In Your Area
            </Text>
          </View>
          {top.url ? (
            <FontAwesome name="external-link" size={14} color={AMBER} />
          ) : null}
        </Pressable>

        {/* Main row — seal + identity */}
        <View
          style={{
            flexDirection: 'row',
            gap: 14,
            alignItems: 'flex-start',
            marginTop: 14,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              // Opaque amber-tinted dark — pre-blended from rgba(amber, 0.18)
              // over the card's slate surface so the stripe pattern doesn't
              // show through this seal box.
              backgroundColor: '#373120',
              borderWidth: 0.5,
              borderColor: `rgba(${AMBER_RGB}, 0.40)`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesome name="exclamation-triangle" size={26} color={AMBER} />
            {/* faint pulse ring */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                right: -3,
                bottom: -3,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: `rgba(${AMBER_RGB}, 0.30)`,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: '#f8fafc',
                lineHeight: 26,
              }}
            >
              {top.declaration_type}-{top.disaster_number} · {incidentLabel}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                marginTop: 6,
                fontSize: 11,
                color: AMBER,
                letterSpacing: 1.8,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              {top.title}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 12.5,
                color: '#9ca3af',
                lineHeight: 18,
              }}
            >
              Designated for {countyName}, {state}
              {more > 0 ? ` · +${more} more` : ''}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ marginTop: 16, height: 1 }}>
          <LinearGradient
            colors={['transparent', `rgba(${AMBER_RGB}, 0.30)`, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </View>

        {/* Action row */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable
            onPress={showOnMap}
            accessibilityRole="button"
            accessibilityLabel="Show closest fire on the map"
            style={{
              flex: 1,
              height: 42,
              borderRadius: 12,
              borderWidth: 0.5,
              borderColor: `rgba(${AMBER_RGB}, 0.40)`,
              // Opaque amber-tinted surface — pre-blended from
              // rgba(amber, 0.10) over the card's slate so stripes
              // don't show through the button.
              backgroundColor: '#26241E',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <FontAwesome name="map-marker" size={13} color={AMBER} />
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: AMBER,
                textTransform: 'uppercase',
              }}
            >
              Show On Map
            </Text>
          </Pressable>
          {top.url ? (
            <Pressable
              onPress={openOfficialPage}
              accessibilityRole="link"
              accessibilityLabel="Open FEMA official page"
              style={{
                flex: 1,
                height: 42,
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: `rgba(${AMBER_RGB}, 0.25)`,
                // Opaque slate surface — blocks the stripe pattern from
                // showing through the button. Slightly darker than the
                // primary action so the two buttons stay distinguishable.
                backgroundColor: '#10141B',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '600',
                  letterSpacing: 1.4,
                  color: AMBER,
                  textTransform: 'uppercase',
                }}
              >
                FEMA Page
              </Text>
              <FontAwesome name="external-link" size={12} color={AMBER} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

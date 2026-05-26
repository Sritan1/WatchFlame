import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, View } from 'react-native';

import type { DangerLevel } from '@/lib/types';

import { PremiumCard } from './PremiumCard';
import { Skeleton } from './Skeleton';

type LevelPalette = {
  color: string;
  rgb: string;
  /** Opaque pre-blend of rgba(rgb, 0.18) over the card's slate surface
   *  (#10141B). Used as the premium variant's icon-tile background so the
   *  PremiumCard's stripe texture doesn't show through it. */
  tileBg: string;
};

/** Palette for each tier. Title and subtitle are supplied by the parent's
 *  `banner` signal so the combined (fire-weather + closest-fire-threat)
 *  rules can live in one place upstream. The EXTREME palette stays in the
 *  table for completeness but the SafetyScreen computeBannerSignal() will
 *  never emit it (per spec — we never say "EVACUATE IMMEDIATELY"). */
const PALETTE: Record<DangerLevel, LevelPalette> = {
  LOW:      { color: '#7ee787', rgb: '126, 231, 135', tileBg: '#243A2E' },
  MODERATE: { color: '#e8b339', rgb: '232, 179, 57',  tileBg: '#373120' },
  HIGH:     { color: '#fb923c', rgb: '251, 146, 60',  tileBg: '#3A2B21' },
  EXTREME:  { color: '#ef4444', rgb: '239, 68, 68',   tileBg: '#381D22' },
};

/** Resolved Safety Status banner content. Computed upstream in safety.tsx
 *  so the matrix that combines weather + closest-fire threat lives in one
 *  place. Mirrors web's BannerSignal. */
export interface BannerSignal {
  /** Drives palette + icon (LOW = green check, else amber/orange warn). */
  level: DangerLevel;
  title: string;
  subtitle: string;
}

/**
 * Status card on the Safety screen. Two variants:
 *
 *   - **Compact** (default): small icon tile + bold title + body. Sits
 *     under the FEMA premium card so the FEMA one stays the hero.
 *
 *   - **Premium** (`premium={true}`): full PremiumCard chrome — slate
 *     gradient + level-tinted border + top accent stripe + soft corner
 *     halo + large 56px framed icon tile + 22px title. Used when FEMA is
 *     NOT active, so the safety status itself becomes the page's hero.
 *
 * `isLoading` renders a skeleton matching whichever variant is requested
 * — we never default to "All Clear" before the risk query resolves
 * (that'd be actively misleading).
 */
export function WarningBanner({
  banner,
  isLoading = false,
  premium = false,
}: {
  banner: BannerSignal;
  isLoading?: boolean;
  /** When true, render the full PremiumCard hero variant. Toggle on when
   *  no higher-priority card (FEMA) is occupying the hero slot. */
  premium?: boolean;
}) {
  if (isLoading) {
    return premium ? <PremiumLoadingSkeleton /> : <CompactLoadingSkeleton />;
  }

  const c = { ...PALETTE[banner.level], title: banner.title, subtitle: banner.subtitle };
  const level = banner.level;

  if (premium) {
    return (
      <PremiumCard
        rgb={c.rgb}
        accentColor={c.color}
        padding={18}
        texture="stripe"
        textureOpacity={0.05}
      >
        {/* Eyebrow row — matches the FEMA card's eyebrow rhythm */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: c.color,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.6,
              color: c.color,
              textTransform: 'uppercase',
            }}
          >
            Safety Status
          </Text>
        </View>

        {/* Main row — 56px framed icon tile + title + body, mirrors the
         *  FEMA card's seal-and-identity composition. */}
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
              backgroundColor: c.tileBg,
              borderWidth: 0.5,
              borderColor: `rgba(${c.rgb}, 0.40)`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesome
              name={level === 'LOW' ? 'check-circle' : 'exclamation-triangle'}
              size={26}
              color={c.color}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: c.color,
                letterSpacing: -0.4,
                lineHeight: 26,
              }}
            >
              {c.title}
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: '#9ca3af',
                lineHeight: 19,
              }}
            >
              {c.subtitle}
            </Text>
          </View>
        </View>
      </PremiumCard>
    );
  }

  // Compact variant (default — used when FEMA is hero)
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
        borderRadius: 16,
        padding: 14,
        backgroundColor: '#10141B',
        borderWidth: 0.5,
        borderColor: `rgba(${c.rgb}, 0.18)`,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: `rgba(${c.rgb}, 0.10)`,
          borderWidth: 0.5,
          borderColor: `rgba(${c.rgb}, 0.28)`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesome
          name={level === 'LOW' ? 'check-circle' : 'exclamation-triangle'}
          size={16}
          color={c.color}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: c.color,
            lineHeight: 20,
          }}
        >
          {c.title}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 13,
            lineHeight: 19,
            color: '#9ca3af',
          }}
        >
          {c.subtitle}
        </Text>
      </View>
    </View>
  );
}

function CompactLoadingSkeleton() {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
        borderRadius: 16,
        padding: 14,
        backgroundColor: '#10141B',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.04)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Skeleton width={16} height={16} rounded="sm" />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={130} height={17} rounded="sm" />
        <Skeleton width={'95%'} height={12} rounded="sm" />
        <Skeleton width={'70%'} height={12} rounded="sm" />
      </View>
    </View>
  );
}

function PremiumLoadingSkeleton() {
  // Neutral slate chrome (no level color yet — risk hasn't resolved).
  return (
    <PremiumCard rgb={'255, 255, 255'} accentColor={'rgba(255,255,255,0.20)'} padding={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Skeleton width={6} height={6} rounded="full" />
        <Skeleton width={100} height={11} rounded="sm" />
      </View>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginTop: 14 }}>
        <Skeleton width={56} height={56} rounded="lg" />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={'70%'} height={24} rounded="sm" />
          <Skeleton width={'95%'} height={13} rounded="sm" />
          <Skeleton width={'80%'} height={13} rounded="sm" />
        </View>
      </View>
    </PremiumCard>
  );
}

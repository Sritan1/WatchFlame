import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { EASE, MOTION } from '@/lib/theme';
import { useScreenActive } from '@/lib/useScreenActive';

import { AnimatedNumber } from './AnimatedNumber';
import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { Skeleton } from './Skeleton';

type Bucket = { label: string; color: string; rgb: string };

// Standard KBDI buckets (Keetch & Byram 1968): 0-200 moist, 200-400 dry,
// 400-600 very dry, 600-800 drought. `rgb` triplet powers gradient stops on
// the progress bar without a runtime hex→rgb conversion.
export function kbdiBucket(kbdi: number): Bucket {
  if (kbdi < 200) return { label: 'Moist',     color: '#7ee787', rgb: '126, 231, 135' };
  if (kbdi < 400) return { label: 'Dry',       color: '#fbbf24', rgb: '251, 191, 36'  };
  if (kbdi < 600) return { label: 'Very dry',  color: '#fb923c', rgb: '251, 146, 60'  };
  return            { label: 'Drought',   color: '#ef4444', rgb: '239, 68, 68'   };
}

/** Animated, gradient-filled bar with a continuous traveling-sheen highlight.
 *  Pure presentational. */
function ProgressBar({ pct, bucket }: { pct: number; bucket: Bucket }) {
  // Width tweens with a slight overshoot so it lands snappily.
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, { duration: MOTION.fill, easing: EASE.spring });
  }, [pct, width]);

  // Sweep starts after the bar has finished filling, then loops. Gated on
  // screen focus so we don't burn frames driving the highlight when Status
  // isn't visible (was previously running forever once mounted).
  const sweep = useSharedValue(-100);
  const active = useScreenActive();
  useEffect(() => {
    if (!active) {
      cancelAnimation(sweep);
      return;
    }
    sweep.value = withDelay(
      1000,
      withRepeat(
        withTiming(300, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      ),
    );
  }, [sweep, active]);

  const widthStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${sweep.value}%` }],
  }));

  return (
    <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      <Animated.View style={[{ height: '100%', overflow: 'hidden' }, widthStyle]}>
        <LinearGradient
          colors={[
            `rgba(${bucket.rgb}, 0.7)`,
            bucket.color,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%' },
            sweepStyle,
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Compact "your area today" card showing real KBDI + (optional) regional state.
 *  Renders shimmering placeholders when `kbdi` is null — same loading pattern
 *  as the Status screen's other cards. */
export function LocalKbdiCard({
  kbdi,
  regionalLevel,
  regionalState,
  isLoading = false,
}: {
  kbdi: number | null;
  regionalLevel: string | null;
  regionalState: string | null;
  /** Distinguishes "still fetching" from "fetched but missing." When false
   *  and kbdi is null, we render an explicit unavailable message instead of
   *  a perpetual skeleton — happens on Open-Meteo outages or for points
   *  outside the archive's coverage. */
  isLoading?: boolean;
}) {
  const loaded = kbdi != null;
  const bucket = loaded ? kbdiBucket(kbdi) : null;
  const pct = loaded ? Math.min(100, (kbdi / 800) * 100) : 0;

  return (
    <Card tone="black">
      <View className="flex-row items-center justify-between">
        <Eyebrow>Your area today</Eyebrow>
        {loaded && regionalLevel && regionalState ? (
          <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
            {regionalState} · {regionalLevel}
          </Text>
        ) : null}
      </View>
      {loaded && bucket ? (
        <>
          <View className="mt-3 flex-row items-baseline">
            <AnimatedNumber
              value={kbdi}
              format={(n) => `${Math.round(n)}`}
              className="text-3xl font-extrabold text-chalk-50"
            />
            <Text className="ml-1 text-xs text-chalk-400">/ 800 KBDI</Text>
            <Text
              className="ml-3 text-xs font-semibold uppercase tracking-[2px]"
              style={{ color: bucket.color }}
            >
              {bucket.label}
            </Text>
          </View>
          <ProgressBar pct={pct} bucket={bucket} />
          <Text className="mt-3 text-[11px] text-chalk-500">
            Keetch-Byram Drought Index — fitted from a year of local weather.
            Replaces the days-since-rain proxy when your location is known.
          </Text>
        </>
      ) : isLoading ? (
        <>
          <View className="mt-3">
            <Skeleton width={180} height={32} rounded="md" />
          </View>
          <View className="mt-3">
            <Skeleton width={'100%'} height={6} rounded="full" />
          </View>
          <Text className="mt-3 text-[11px] text-chalk-500">
            Keetch-Byram Drought Index — fitted from a year of local weather.
            Replaces the days-since-rain proxy when your location is known.
          </Text>
        </>
      ) : (
        <>
          <Text className="mt-3 text-sm text-chalk-100">
            Drought reading unavailable.
          </Text>
          <Text className="mt-2 text-[11px] text-chalk-500">
            Couldn&apos;t reach the Open-Meteo weather archive. The risk score
            falls back to a days-since-rain proxy when this happens.
          </Text>
        </>
      )}
    </Card>
  );
}

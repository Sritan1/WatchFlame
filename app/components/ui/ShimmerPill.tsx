import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import type { DangerLevel } from '@/lib/types';
import { useScreenActive } from '@/lib/useScreenActive';

const LEVEL_COLOR: Record<DangerLevel, { color: string; rgb: string }> = {
  LOW:      { color: '#7ee787', rgb: '126, 231, 135' },
  MODERATE: { color: '#fbbf24', rgb: '251, 191, 36'  },
  HIGH:     { color: '#fb923c', rgb: '251, 146, 60'  },
  EXTREME:  { color: '#ef4444', rgb: '239, 68, 68'   },
};

// Pre-computed easing curves — same as the originals; reused per render.
// .factory() unwraps the EasingFunctionFactory into a callable worklet.
const RING_EASE = Easing.bezier(0.2, 0.7, 0.3, 1).factory();
const SWEEP_EASE = Easing.bezier(0.4, 0, 0.6, 1).factory();
const RING_PERIOD_MS = 1800;
const SWEEP_PERIOD_MS = 3400;
const TICK_MS = 1000 / 30;

/**
 * The signature liquid-glass danger pill. Built from:
 *   - Translucent risk-tinted background + 0.5px hairline border
 *   - Dot with an outer expanding-ring pulse (~1.8s loop)
 *   - 40%-wide white sheen sweeping across the pill (~3.4s loop)
 *
 * Replaces the compact DangerPill on the Status hero. Other surfaces still
 * use DangerPill for the full-width or compact variants.
 *
 * styleUI § 5.5 reference.
 */
export function ShimmerPill({ level }: { level: DangerLevel }) {
  const { color, rgb } = LEVEL_COLOR[level];
  // Pause the dot-pulse and sweep when the screen isn't focused so we're not
  // burning frames driving offscreen animations.
  const active = useScreenActive();

  // Single 30fps elapsed-time accumulator services both the dot-pulse and
  // the sweep. Each style worklet derives its current value from elapsedMs
  // mod its own period — preserves the original 1800/3400ms loop lengths
  // and bezier easings, at half the per-frame worklet cost.
  const elapsedMs = useSharedValue(0);
  const lastTickAt = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const now = info.timestamp;
    if (lastTickAt.value === 0) {
      lastTickAt.value = now;
      return;
    }
    const dt = now - lastTickAt.value;
    if (dt < TICK_MS) return;
    elapsedMs.value = elapsedMs.value + dt;
    lastTickAt.value = now;
  }, false);

  useEffect(() => {
    if (!active) {
      frame.setActive(false);
      lastTickAt.value = 0;
      return;
    }
    frame.setActive(true);
  }, [active, frame, lastTickAt]);

  // Dot pulse: outer ring scales 1 → 2.4 + opacity 0.9 → 0 over 1800ms,
  // bezier ease. Snap-back at end of cycle (original used withRepeat which
  // resets to start each iteration).
  const ringStyle = useAnimatedStyle(() => {
    const phase = (elapsedMs.value % RING_PERIOD_MS) / RING_PERIOD_MS;
    const eased = RING_EASE(phase);
    return {
      transform: [{ scale: 1 + (2.4 - 1) * eased }],
      opacity: 0.9 * (1 - eased),
    };
  });

  // Sheen: 40%-wide highlight sweeping translateX -100% → 250% over 3400ms.
  const sweepStyle = useAnimatedStyle(() => {
    const phase = (elapsedMs.value % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
    const eased = SWEEP_EASE(phase);
    const x = -100 + (250 - -100) * eased;
    return { transform: [{ translateX: `${x}%` }] };
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        borderRadius: 999,
        borderWidth: 0.5,
        borderColor: `rgba(${rgb}, 0.55)`,
        backgroundColor: `rgba(${rgb}, 0.16)`,
        paddingHorizontal: 14,
        paddingVertical: 7,
        overflow: 'hidden',
      }}
    >
      {/* Dot + pulsing ring */}
      <View
        style={{
          width: 10,
          height: 10,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: color,
            },
            ringStyle,
          ]}
        />
      </View>

      <Text
        style={{
          color,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 2.5,
          textTransform: 'uppercase',
        }}
      >
        {level}
      </Text>

      {/* Continuous sheen sweep — 40% wide white-to-transparent gradient */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '40%',
          },
          sweepStyle,
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.22)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

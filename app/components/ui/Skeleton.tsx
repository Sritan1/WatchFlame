import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useScreenActive } from '@/lib/useScreenActive';

/** Shimmering placeholder while data loads. */
export function Skeleton({
  width,
  height,
  rounded = 'md',
  className,
}: {
  width?: number | `${number}%`;
  height: number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}) {
  const opacity = useSharedValue(0.55);
  // Pause the shimmer when the screen isn't visible — if a long-loading
  // (or perma-loading) skeleton is mounted on a backgrounded tab, the
  // pulsing has been costing per-frame work for nothing.
  const active = useScreenActive();

  useEffect(() => {
    if (!active) {
      cancelAnimation(opacity);
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, active]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const radius =
    rounded === 'sm' ? 6 : rounded === 'md' ? 10 : rounded === 'lg' ? 16 : 999;

  return (
    <View style={{ width, height, borderRadius: radius }} className={className}>
      <Animated.View
        style={[{ flex: 1, borderRadius: radius, backgroundColor: '#26262a' }, animated]}
      />
    </View>
  );
}

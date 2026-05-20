import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/lib/theme';

/**
 * Word-by-word staggered headline. Each word fades up from below with a
 * cubic ease-out. Key the parent on the headline content to replay the
 * animation when the message changes.
 *
 * RN doesn't support `filter: blur` without Skia, so the styleUI's blur-clear
 * step is omitted — opacity + translateY alone is still distinctly cinematic
 * vs. a static <Text>.
 */
export function StaggerHeadline({
  lines,
  textClassName,
  initialDelay = 120,
  perWordDelay = 70,
}: {
  lines: string[];
  /** Tailwind classes for each Text. */
  textClassName?: string;
  /** Delay before the first word starts (ms). */
  initialDelay?: number;
  /** Stagger between consecutive words (ms). */
  perWordDelay?: number;
}) {
  // Precompute per-word render data with a continuous index across lines so
  // delays don't reset between lines.
  let idx = 0;
  const linesData = lines.map((line, lineIdx) => {
    const words = line.split(' ');
    return words.map((word, i) => ({
      lineIdx,
      i,
      word,
      delay: initialDelay + idx++ * perWordDelay,
      isLastInLine: i === words.length - 1,
    }));
  });

  return (
    <View style={{ alignItems: 'center' }}>
      {linesData.map((words, lineIdx) => (
        <View
          key={lineIdx}
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {words.map((w) => (
            <Word
              key={`${w.lineIdx}-${w.i}-${w.word}`}
              text={w.isLastInLine ? w.word : `${w.word} `}
              textClassName={textClassName}
              delay={w.delay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Word({
  text,
  textClassName,
  delay,
}: {
  text: string;
  textClassName?: string;
  delay: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 550, easing: EASE.out }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 550, easing: EASE.out }));
    // Run once on mount; re-mount via key to replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text className={textClassName}>{text}</Text>
    </Animated.View>
  );
}

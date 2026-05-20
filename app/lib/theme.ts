/**
 * Standardized motion + typography tokens.
 *
 * Goal (per docs/styleUI.md): a small, consistent vocabulary so animations
 * feel intentional and numeric values don't shift width as they tick.
 *
 * Always import from here instead of hand-coding durations or easings — when
 * we want to globally re-time the app, this is the one place to change.
 */
import { Easing, type EasingFunction } from 'react-native-reanimated';
import { TextStyle } from 'react-native';

/** Standard durations (ms). */
export const MOTION = {
  /** Press feedback, hover-equivalent state changes. */
  fast: 220,
  /** Screen transitions, modal opens. */
  med:  380,
  /** Numeric counter landings. */
  slow: 1100,
  /** Bar / arc fills with springy overshoot. */
  fill: 1200,
} as const;

/** Standard easings. */
export const EASE = {
  /** Cubic ease-out — fast start, soft landing. Default for most transitions. */
  out: Easing.bezier(0.2, 0.7, 0.3, 1) as unknown as EasingFunction,
  /** Springy overshoot — for fills, bars, arcs landing into place. */
  spring: Easing.bezier(0.3, 1.2, 0.4, 1) as unknown as EasingFunction,
  /** Number counter — fast start, soft landing (~ 1 - (1-t)^3.2). */
  number: Easing.bezier(0.18, 0.7, 0.2, 1) as unknown as EasingFunction,
} as const;

/**
 * Lock numeric displays so digits don't shift width as they animate or update.
 * Apply to any <Text> showing a number that may change — risk score, KBDI,
 * fire counts, distance, percentages.
 */
export const TABULAR: TextStyle = {
  fontVariant: ['tabular-nums'],
};

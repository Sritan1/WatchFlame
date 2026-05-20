import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import type { DangerLevel } from '@/lib/types';
import { useScreenActive } from '@/lib/useScreenActive';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LEVEL_COLOR: Record<DangerLevel, { color: string; rgb: string }> = {
  LOW:      { color: '#7ee787', rgb: '126, 231, 135' },
  MODERATE: { color: '#fbbf24', rgb: '251, 191, 36'  },
  HIGH:     { color: '#fb923c', rgb: '251, 146, 60'  },
  EXTREME:  { color: '#ef4444', rgb: '239, 68, 68'   },
};

// Visible-arc floor so the endpoint dot is reachable even at near-zero score.
// Below this, the arc would be a single pixel — invisible against the track.
const ARC_MIN_FRACTION = 0.04;

export type RegionalThresholds = {
  low: number;       // 50th percentile of fire-day scores → boundary at fill=0.50
  moderate: number;  // 75th percentile                    → boundary at fill=0.75
  high: number;      // 90th percentile (informational, not a level boundary)
  extreme: number;   // 97th percentile                    → boundary at fill=0.97
  score_max: number; // upper anchor for the EXTREME band  → fill=1.00
};

/**
 * Map an absolute 0–1 risk score to the arc fraction the dial should show.
 *
 * Without thresholds: pass-through (the dial is just the raw score).
 *
 * With thresholds (regional calibration active): piecewise linear so each
 * bucket boundary lands at a meaningful visual position. EXTREME at the
 * 97th percentile pegs the arc at 97% full — so the dial and the regional
 * pill always agree visually, even in Florida-style low-absolute-score states.
 *
 *   score = 0                 → fill 0
 *   score = thresholds.low    → fill 0.50  (LOW/MODERATE boundary)
 *   score = thresholds.moderate → fill 0.75  (MODERATE/HIGH boundary)
 *   score = thresholds.extreme  → fill 0.97  (HIGH/EXTREME boundary)
 *   score = thresholds.score_max → fill 1.00 (top of state's observed range)
 *   score ≥ score_max          → fill 1.00 (clamped)
 */
function scoreToFraction(score: number, t: RegionalThresholds | null | undefined): number {
  if (!t) return score;
  // Guard against malformed thresholds (a zero or non-monotonic block would
  // divide by zero below). Fall back to raw score.
  if (!(t.low > 0 && t.moderate > t.low && t.extreme > t.moderate && t.score_max >= t.extreme)) {
    return score;
  }
  if (score <= 0) return 0;
  if (score < t.low)       return (score / t.low) * 0.50;
  if (score < t.moderate)  return 0.50 + ((score - t.low)      / (t.moderate - t.low))      * 0.25;
  if (score < t.extreme)   return 0.75 + ((score - t.moderate) / (t.extreme  - t.moderate)) * 0.22;
  // Above the EXTREME cutoff — sweep the last 3% of arc up to score_max.
  // Clamp at 1.0 for anything past the observed max.
  if (t.score_max <= t.extreme) return 1.0; // degenerate: score_max == extreme
  const past = (score - t.extreme) / (t.score_max - t.extreme);
  return Math.min(1.0, 0.97 + past * 0.03);
}

/**
 * Cinematic risk orb — three distinct concentric ring bands:
 *   • Outer ring:  60 tick marks (every 5th long) at the perimeter
 *   • Middle ring: faint full track + animated colored risk-score arc + endpoint dot
 *   • Inner ring:  rotating dashed circle (flat in-plane rotation, not a tilted orbit)
 *
 * Plus support layers:
 *   - Outer pulse rings (only when alarming) — scale + fade loop
 *   - Soft tinted radial glow halo
 *   - Glassy core with off-center reflection + shield/fire icon
 *
 * The arc length is the actual `score` (0–1). The `level` only drives the color
 * palette so the same numeric score in different states reads with a different
 * tint when regional calibration kicks in.
 *
 * Re-animates with springy overshoot whenever score changes (e.g. when the
 * user switches saved location and the new place's risk arrives).
 */
export function HeroOrb({
  score,
  level,
  thresholds,
  size = 220,
}: {
  score: number | null;
  level: DangerLevel | null;
  /** Per-state cutoffs from /risk. When present, the arc fills by regional
   *  percentile so the dial agrees with the regional level pill. When absent
   *  (ungeolocated or outside the 17 fitted states), falls back to absolute
   *  0–1 score. */
  thresholds?: RegionalThresholds | null;
  size?: number;
}) {
  const palette = level ? LEVEL_COLOR[level] : { color: '#9ca3af', rgb: '156, 163, 175' };
  const isAlarming = level === 'HIGH' || level === 'EXTREME';
  // Gate the continuous loops (inner-ring rotation, pulse rings, flicker) on
  // focus + foreground so the orb stops costing CPU when the user navigates
  // away. The arc-fill is a one-shot on score change so it doesn't need to be
  // gated — it just won't get a chance to run while the screen is offscreen.
  const active = useScreenActive();
  // Convert raw score → display fraction (regional percentile when thresholds
  // are available, else raw score), then clamp to [ARC_MIN_FRACTION, 1] so
  // the endpoint dot is always positioned visibly. Null → empty arc (loading).
  const targetFraction =
    score == null
      ? 0
      : Math.max(ARC_MIN_FRACTION, Math.min(1, scoreToFraction(score, thresholds)));

  const cx = size / 2;
  const cy = size / 2;

  // Geometry — three concentric bands with ~12px gaps, mirroring the
  // outer/middle/inner ratios in home.jsx (200/170/150 on a 220 container).
  // The middle ring is the hero — it carries the risk-score arc.
  const tickR = size / 2 - 6;        // outer ring: tick marks at the perimeter
  const arcR = size / 2 - 18;        // middle ring: colored arc + faint track
  const innerRingR = size * 0.34;    // inner ring: rotating dashed CIRCLE (in-plane)
  const coreSize = size * 0.42;      // glassy sphere at the center

  const circumference = 2 * Math.PI * arcR;

  // ---- Animations -------------------------------------------------------
  // Arc fill — springy overshoot to feel physical, not mechanical.
  // Skip when score is null (refetch in flight) so the arc doesn't collapse
  // to 0 and re-grow when the user switches locations.
  const fraction = useSharedValue(0);
  useEffect(() => {
    if (score == null) return;
    fraction.value = withTiming(targetFraction, {
      duration: 1200,
      easing: Easing.bezier(0.3, 1.2, 0.4, 1),
    });
  }, [targetFraction, fraction, score]);

  const arcAnimatedProps = useAnimatedProps(() => {
    const filled = fraction.value * circumference;
    return {
      strokeDasharray: [filled, circumference - filled].join(' '),
    } as Partial<{ strokeDasharray: string }>;
  });

  // Endpoint dot follows the arc tip (start at top = -π/2, sweep clockwise).
  const endpointInnerProps = useAnimatedProps(() => {
    const angle = fraction.value * 2 * Math.PI - Math.PI / 2;
    return {
      cx: cx + Math.cos(angle) * arcR,
      cy: cy + Math.sin(angle) * arcR,
    } as Partial<{ cx: number; cy: number }>;
  });
  const endpointGlowProps = useAnimatedProps(() => {
    const angle = fraction.value * 2 * Math.PI - Math.PI / 2;
    return {
      cx: cx + Math.cos(angle) * arcR,
      cy: cy + Math.sin(angle) * arcR,
    } as Partial<{ cx: number; cy: number }>;
  });

  // Shared 30fps elapsed-time accumulator for the continuous loops below
  // (inner ring rotation, alarming-only core flicker). One frame callback
  // services both — the per-style worklets just derive from elapsedMs.
  // Pause/resume zeroes lastTickAt so resume doesn't catch up by minutes.
  const TICK_MS = 1000 / 30;
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

  // Counter-rotating inner dashed ring — slow, infinite, linear.
  // -360° over 22000ms; elapsedMs grows unboundedly and rotation just keeps
  // accumulating. 360°-periodic so visual position never jumps.
  const innerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(elapsedMs.value * -360) / 22000}deg` }],
  }));

  // Subtle core flicker when alarming. Original was withSequence(toggle
  // between 0.85 and 1.0 over 1200ms each = 2400ms period with ease-in-out).
  // Approximated here as a cosine oscillation between 0.85 and 1.0 with
  // the same 2400ms period — visually indistinguishable.
  const flickerStyle = useAnimatedStyle(() => {
    if (!isAlarming) return { opacity: 1 };
    const phase = (elapsedMs.value / 2400) * 2 * Math.PI;
    return { opacity: 0.925 + 0.075 * Math.cos(phase) };
  });

  // Tick mark geometry — 60 ticks total, every 6th is longer + brighter,
  // yielding 10 prominent ticks at 36° intervals (was 12 at 30° which read
  // as a clock face). Total small-tick density unchanged.
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const isLong = i % 6 === 0;
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const innerR = isLong ? tickR - 6 : tickR - 3;
    const outerR = tickR;
    return {
      x1: cx + Math.cos(angle) * innerR,
      y1: cy + Math.sin(angle) * innerR,
      x2: cx + Math.cos(angle) * outerR,
      y2: cy + Math.sin(angle) * outerR,
      isLong,
    };
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Layer 1 — pulse rings (alarming only). All three rings share the
       *  parent's elapsedMs accumulator so we run ONE frame callback total
       *  instead of three. Eliminates the laggy alarming-state pulse we saw
       *  when each ring was driving its own useFrameCallback. */}
      {isAlarming
        ? [0, 1, 2].map((i) => (
            <PulseRing key={i} index={i} color={palette.color} elapsedMs={elapsedMs} />
          ))
        : null}

      {/* Layer 2 — soft glow halo */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute' }}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
            <Stop
              offset="0%"
              stopColor={palette.color}
              stopOpacity={isAlarming ? 0.35 : 0.18}
            />
            <Stop offset="65%" stopColor={palette.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={size / 2} fill="url(#orbGlow)" />
      </Svg>

      {/* Layer 3 — tick ring */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute' }}
        pointerEvents="none"
      >
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isLong ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.16)'}
            strokeWidth={t.isLong ? 0.9 : 0.5}
            strokeLinecap="round"
          />
        ))}
      </Svg>

      {/* Middle ring — track + risk-score arc + endpoint dot. This is the
       *  hero of the orb: a wide soft underglow stroke beneath the crisp
       *  colored arc gives it bloom and pulls the eye, the way home.jsx's
       *  middle ring uses the risk color while the outer/inner stay neutral. */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute' }}
        pointerEvents="none"
      >
        {/* Faint full circle track */}
        <Circle
          cx={cx}
          cy={cy}
          r={arcR}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          fill="none"
        />
        {/* Soft underglow — same arc, much wider + low alpha */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={arcR}
          stroke={palette.color}
          strokeOpacity={isAlarming ? 0.35 : 0.22}
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          animatedProps={arcAnimatedProps}
        />
        {/* Crisp colored arc on top of the bloom */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={arcR}
          stroke={palette.color}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          animatedProps={arcAnimatedProps}
        />
        {/* Endpoint marker — wide soft glow + medium halo + bright core */}
        {score != null ? (
          <>
            <AnimatedCircle
              r={9}
              fill={palette.color}
              fillOpacity={0.30}
              animatedProps={endpointGlowProps}
            />
            <AnimatedCircle
              r={5}
              fill={palette.color}
              fillOpacity={0.65}
              animatedProps={endpointGlowProps}
            />
            <AnimatedCircle
              r={3}
              fill={palette.color}
              animatedProps={endpointInnerProps}
            />
          </>
        ) : null}
      </Svg>

      {/* Inner ring — flat dashed CIRCLE rotating in-plane around the orb.
       *  Was an angled Ellipse (ry = rx * 0.45) which read as a Saturn-style
       *  orbital path. A true circle keeps the rotation in-plane; the dashes
       *  carry the visible motion. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: size, height: size },
          innerRingStyle,
        ]}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={innerRingR}
            stroke={isAlarming ? palette.color : '#ffffff'}
            strokeOpacity={isAlarming ? 0.32 : 0.18}
            strokeWidth={0.75}
            strokeDasharray="3 7"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Layer 6 — glassy core */}
      <Animated.View
        style={[
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'absolute',
            backgroundColor: '#11141b',
            borderWidth: 0.5,
            borderColor: `rgba(${palette.rgb}, ${isAlarming ? 0.6 : 0.20})`,
            overflow: 'hidden',
          },
          flickerStyle,
        ]}
      >
        <Svg
          width={coreSize}
          height={coreSize}
          style={{ position: 'absolute', top: 0, left: 0 }}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient id="coreGrad" cx="30%" cy="30%" r="70%">
              {isAlarming
                ? [
                    <Stop key="0" offset="0%" stopColor={palette.color} stopOpacity={1} />,
                    <Stop key="1" offset="60%" stopColor={palette.color} stopOpacity={0.6} />,
                    <Stop key="2" offset="100%" stopColor={palette.color} stopOpacity={0.2} />,
                  ]
                : [
                    <Stop key="0" offset="0%" stopColor="#1a1a1d" />,
                    <Stop key="1" offset="100%" stopColor="#0e1015" />,
                  ]}
            </RadialGradient>
            <RadialGradient id="coreReflection" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.45} />
              <Stop offset="70%" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={coreSize / 2} cy={coreSize / 2} r={coreSize / 2} fill="url(#coreGrad)" />
          <Ellipse
            cx={coreSize * 0.3}
            cy={coreSize * 0.22}
            rx={coreSize * 0.18}
            ry={coreSize * 0.09}
            fill="url(#coreReflection)"
          />
        </Svg>

        <FontAwesome
          name={isAlarming ? 'fire' : 'shield'}
          size={Math.round(coreSize * 0.35)}
          color={isAlarming ? '#ffffff' : palette.color}
        />
      </Animated.View>
    </View>
  );
}

// Pre-computed bezier easing matches the original withTiming curve. Reused
// per pulse-ring instance so the function isn't reconstructed every render.
// .factory() unwraps the EasingFunctionFactory into a callable worklet.
const PULSE_EASE = Easing.bezier(0.2, 0.7, 0.3, 1).factory();

function PulseRing({
  index,
  color,
  elapsedMs,
}: {
  index: number;
  color: string;
  /** Shared 30fps accumulator from the parent HeroOrb — driven by the parent's
   *  useFrameCallback so all three rings + the orb's rotation + flicker
   *  cost a SINGLE frame callback instead of four. */
  elapsedMs: ReturnType<typeof useSharedValue<number>>;
}) {
  // The cycle is `delay + dur` ms; within the cycle, the first `delay` ms
  // holds at (scale 0.8, opacity 0.6) and the remaining `dur` ms animates
  // outward (scale 3.2, opacity 0) using the bezier curve from the original
  // withTiming. Three rings with staggered delays = staggered pulses.
  const DUR = 4000;
  const DELAY = index * (DUR / 3);
  const CYCLE = DUR + DELAY;

  const animatedStyle = useAnimatedStyle(() => {
    const cyclePos = elapsedMs.value % CYCLE;
    if (cyclePos < DELAY) {
      return { transform: [{ scale: 0.8 }], opacity: 0.6 };
    }
    const phase = (cyclePos - DELAY) / DUR;
    const eased = PULSE_EASE(phase);
    return {
      transform: [{ scale: 0.8 + (3.2 - 0.8) * eased }],
      opacity: 0.6 * (1 - eased),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 90,
          height: 90,
          borderRadius: 45,
          borderWidth: 1,
          borderColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useScreenActive } from '@/lib/useScreenActive';

const SCREEN = Dimensions.get('window');

// Moderate palette from background-waves.jsx, in hex (react-native-svg's
// stopColor is unreliable when given rgba — use stopColor + stopOpacity).
const PAL = ['#e8b339', '#dc823c', '#b46446'];

// Pulse-speed equivalent. The original file derives `speedMult` from a
// pulseSpeed slider (default 70). Bump it slightly above 1.0 since the user
// wanted things faster than file-default.
const SPEED_MULT = 1.4;
// Intensity multiplier for moderate per the original file.
const INTENSITY = 0.75;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Animated background — moderate variant.
 *
 * Two animated layers:
 *   1. Drifting color blobs — large radial-gradient circles moving in
 *      Lissajous patterns (cx/cy independently sinusoidal), with a slow
 *      "breath" scale. These are the "colors moving with the waves" effect.
 *   2. Morphing sine wave bands — paths recomputed each frame in a Reanimated
 *      worklet as `phase1`/`phase2` advance. This gives the smooth flowing
 *      morph the canvas original has, instead of a band that just translates.
 *
 * The original (background-waves.jsx) uses HTMLCanvas + globalCompositeOperation
 * 'lighter' for additive color blending. RN can't do that without Skia, so
 * blobs blend with normal alpha — close enough on a dark base.
 */
export function WavesBackground() {
  const screenW = SCREEN.width;
  const screenH = SCREEN.height;
  // Gate the animation loops on focus + foreground. When false, the inner
  // Blob/MorphingWave components cancel their shared-value animations and the
  // worklets stop being scheduled — significant CPU/heat savings while the
  // user is on another tab or the app is backgrounded.
  const active = useScreenActive();

  // Deterministic per-blob seed so layout is stable across renders.
  const blobs = useMemo(() => {
    const seed = (i: number, n: number) => (Math.sin(i * 7.13 + n * 2.71) + 1) / 2;
    const Rmax = Math.max(screenW, screenH);
    return [0, 1, 2, 3].map((i) => ({
      baseCX: seed(i, 0),
      baseCY: seed(i, 1),
      ax: 0.18 + seed(i, 2) * 0.20,
      ay: 0.12 + seed(i, 3) * 0.18,
      // Periods directly reproduce the original fx/fy (rad/ms) but inverted
      // and faster via SPEED_MULT. fx ranges 0.00006–0.00018 → period 35–105s.
      periodXms: ((2 * Math.PI) / ((0.00006 + seed(i, 4) * 0.00012) * SPEED_MULT)),
      periodYms: ((2 * Math.PI) / ((0.00005 + seed(i, 5) * 0.00010) * SPEED_MULT)),
      breathPeriodMs: ((2 * Math.PI) / ((0.0003 + seed(i, 6) * 0.0004) * SPEED_MULT)),
      radPx: Rmax * (0.45 + seed(i, 7) * 0.35),
      color: PAL[i % PAL.length],
      alpha: (0.30 + seed(i, 8) * 0.18) * INTENSITY,
    }));
  }, [screenW, screenH]);

  // 4 morphing wave bands. (Was 5; the bottommost — at ~0.88×screenH — was
  // removed as part of the heat-reduction pass; perf saving ~20% in the wave
  // layer. The midY formula keeps the same i/5 spread so the remaining four
  // sit at ~0.20, 0.37, 0.54, 0.71 of screenH — visually unchanged from before.)
  const waves = useMemo(() => {
    const seed = (i: number, n: number) => (Math.sin(i * 11.7 + n * 3.13 + 100) + 1) / 2;
    return [0, 1, 2, 3].map((i) => ({
      midY: (0.20 + (i / 5) * 0.85 + (seed(i, 0) - 0.5) * 0.05) * screenH,
      amp1: 26 + seed(i, 1) * 36,
      amp2: 14 + seed(i, 2) * 22,
      // Wavelengths from the original — 2618–6283 px (way larger than screen).
      // Combined with phase morphing this gives gentle flowing motion.
      freq1: 0.0010 + seed(i, 3) * 0.0014,
      freq2: 0.0024 + seed(i, 4) * 0.0030,
      thickness: 38 + seed(i, 5) * 56,
      // periodPhaseMs = full 2π cycle. speed1 ranges 0.00012–0.00034 rad/ms
      // (post-SPEED_MULT) → period 13–39s. Faster than the original file's
      // ~25s default to give the user the snappier feel they wanted.
      periodPhase1Ms: (2 * Math.PI) / ((0.00012 + seed(i, 6) * 0.00022) * SPEED_MULT),
      periodPhase2Ms: (2 * Math.PI) / ((0.00020 + seed(i, 7) * 0.00030) * SPEED_MULT),
      color: PAL[i % PAL.length],
      alpha: (0.10 + seed(i, 8) * 0.10) * INTENSITY,
      edgeAlpha: (0.30 + seed(i, 9) * 0.25) * INTENSITY,
    }));
  }, [screenH]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {/* Solid base */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#0a0a0b',
        }}
      />

      {/* Layer 1 — drifting color blobs */}
      {blobs.map((b, i) => (
        <Blob key={`blob-${i}`} {...b} screenW={screenW} screenH={screenH} active={active} />
      ))}

      {/* Layer 2 — morphing wave bands */}
      {waves.map((w, i) => (
        <MorphingWave key={`wave-${i}`} {...w} screenW={screenW} screenH={screenH} active={active} />
      ))}

      {/* Light center vignette — only darkens far corners */}
      <Svg
        width={screenW}
        height={screenH}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Defs>
          <RadialGradient
            id="vignette"
            cx="50%"
            cy="50%"
            r="80%"
            gradientTransform="matrix(1.2 0 0 1 -0.1 0)"
          >
            <Stop offset="60%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.30} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={screenW} height={screenH} fill="url(#vignette)" />
      </Svg>

      {/* Short header + tab-bar scrims */}
      <LinearGradient
        colors={['#0a0a0b', 'rgba(10,10,11,0)']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 90,
          opacity: 0.55,
        }}
      />
      <LinearGradient
        colors={['rgba(10,10,11,0)', '#0a0a0b']}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 110,
          opacity: 0.55,
        }}
      />
    </View>
  );
}

// ---- Blob -------------------------------------------------------------------

type BlobProps = {
  color: string;
  alpha: number;
  baseCX: number;        // 0..1 fraction of screenW
  baseCY: number;        // 0..1 fraction of screenH
  ax: number;            // amplitude x as fraction of screen
  ay: number;            // amplitude y as fraction
  periodXms: number;
  periodYms: number;
  breathPeriodMs: number;
  radPx: number;         // blob radius in pixels
  screenW: number;
  screenH: number;
  active: boolean;
};

function Blob({
  color,
  alpha,
  baseCX,
  baseCY,
  ax,
  ay,
  periodXms,
  periodYms,
  breathPeriodMs,
  radPx,
  screenW,
  screenH,
  active,
}: BlobProps) {
  const phx = useSharedValue(0);
  const phy = useSharedValue(0);
  const breath = useSharedValue(0);

  // 30fps target — matches MorphingWave. Each blob's useAnimatedStyle reads
  // these three phases per frame; halving the tick rate halves how often
  // the style worklet runs.
  const TICK_MS = 1000 / 30;
  const rateX = (2 * Math.PI) / periodXms;
  const rateY = (2 * Math.PI) / periodYms;
  const rateB = (2 * Math.PI) / breathPeriodMs;
  const lastTickAt = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const now = info.timestamp;
    if (lastTickAt.value === 0) {
      lastTickAt.value = now;
      return;
    }
    const elapsed = now - lastTickAt.value;
    if (elapsed < TICK_MS) return;
    phx.value = phx.value + rateX * elapsed;
    phy.value = phy.value + rateY * elapsed;
    breath.value = breath.value + rateB * elapsed;
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

  const blobStyle = useAnimatedStyle(() => {
    const x = (baseCX + Math.sin(phx.value) * ax) * screenW;
    const y = (baseCY + Math.cos(phy.value) * ay) * screenH;
    const scale = 0.85 + 0.15 * Math.sin(breath.value);
    return {
      transform: [
        { translateX: x - radPx },
        { translateY: y - radPx },
        { scale },
      ],
    };
  });

  // Gradient ID has to be stable + unique within the render tree.
  const gid = `blob-${Math.round(baseCX * 100)}-${Math.round(baseCY * 100)}-${color.replace('#', '')}`;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: radPx * 2, height: radPx * 2 },
        blobStyle,
      ]}
    >
      <Svg width={radPx * 2} height={radPx * 2}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={alpha} />
            <Stop offset="40%" stopColor={color} stopOpacity={alpha * 0.45} />
            <Stop offset="70%" stopColor={color} stopOpacity={alpha * 0.15} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={radPx} cy={radPx} r={radPx} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

// ---- MorphingWave -----------------------------------------------------------

type WaveProps = {
  midY: number;
  amp1: number;
  amp2: number;
  freq1: number;
  freq2: number;
  thickness: number;
  color: string;
  alpha: number;
  edgeAlpha: number;
  periodPhase1Ms: number;
  periodPhase2Ms: number;
  screenW: number;
  screenH: number;
  active: boolean;
};

function MorphingWave({
  midY,
  amp1,
  amp2,
  freq1,
  freq2,
  thickness,
  color,
  alpha,
  edgeAlpha,
  periodPhase1Ms,
  periodPhase2Ms,
  screenW,
  screenH,
  active,
}: WaveProps) {
  const phase1 = useSharedValue(0);
  const phase2 = useSharedValue(0);
  // 30fps target — visually identical to 60fps for slow wave motion but the
  // path-recompute worklet only fires half as often → ~50% CPU saving in
  // the wave layer. The phases accumulate unboundedly (Math.sin wraps for
  // us); pause/resume just stops/resumes the callback and continues from
  // wherever the phase landed, so no visual snap.
  const WAVE_FPS = 30;
  const TICK_MS = 1000 / WAVE_FPS;
  const rate1 = (2 * Math.PI) / periodPhase1Ms; // radians per ms
  const rate2 = (2 * Math.PI) / periodPhase2Ms;
  const lastTickAt = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const now = info.timestamp;
    if (lastTickAt.value === 0) {
      lastTickAt.value = now;
      return;
    }
    const elapsed = now - lastTickAt.value;
    if (elapsed < TICK_MS) return;
    // Advance by the ACTUAL elapsed time, not a fixed TICK_MS — keeps the
    // phase speed correct even when a frame is dropped or the OS throttles.
    phase1.value = phase1.value + rate1 * elapsed;
    phase2.value = phase2.value + rate2 * elapsed;
    lastTickAt.value = now;
  }, false);

  useEffect(() => {
    if (!active) {
      frame.setActive(false);
      // Drop the timestamp so the next resume doesn't see a huge "elapsed"
      // and jump phases by minutes' worth of motion.
      lastTickAt.value = 0;
      return;
    }
    frame.setActive(true);
  }, [active, frame, lastTickAt]);

  // Worklet — recomputes the band path each frame as the phases advance.
  // step=22 keeps the path under ~35 segments per wave (visually identical to
  // a denser sample on a phone screen, but ~30% less Math.sin per frame than
  // step=16). Combined with the focus pause this is the bulk of the heat fix.
  const fillProps = useAnimatedProps(() => {
    const half = thickness / 2;
    const step = 22;
    const W = screenW;
    let path = '';
    for (let x = -20; x <= W + 20; x += step) {
      const off =
        Math.sin(x * freq1 + phase1.value) * amp1 +
        Math.sin(x * freq2 + phase2.value) * amp2;
      const y = midY + off - half;
      path += (x === -20 ? 'M' : 'L') + x.toFixed(0) + ',' + y.toFixed(1) + ' ';
    }
    for (let x = W + 20; x >= -20; x -= step) {
      const off =
        Math.sin(x * freq1 + phase1.value) * amp1 +
        Math.sin(x * freq2 + phase2.value) * amp2;
      const y = midY + off + half;
      path += 'L' + x.toFixed(0) + ',' + y.toFixed(1) + ' ';
    }
    path += 'Z';
    return { d: path };
  });

  const edgeProps = useAnimatedProps(() => {
    const step = 22;
    const W = screenW;
    let path = '';
    for (let x = -20; x <= W + 20; x += step) {
      const off =
        Math.sin(x * freq1 + phase1.value) * amp1 +
        Math.sin(x * freq2 + phase2.value) * amp2;
      const y = midY + off;
      path += (x === -20 ? 'M' : 'L') + x.toFixed(0) + ',' + y.toFixed(1) + ' ';
    }
    return { d: path };
  });

  const gid = `wave-${Math.round(midY)}-${color.replace('#', '')}`;

  return (
    <Svg
      pointerEvents="none"
      width={screenW}
      height={screenH}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      <Defs>
        <SvgLinearGradient
          id={gid}
          x1="0"
          y1={midY - thickness / 2}
          x2="0"
          y2={midY + thickness / 2}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={color} stopOpacity={0} />
          <Stop offset="50%" stopColor={color} stopOpacity={alpha} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <AnimatedPath fill={`url(#${gid})`} animatedProps={fillProps} />
      <AnimatedPath
        stroke={color}
        strokeOpacity={edgeAlpha}
        strokeWidth={1}
        fill="none"
        animatedProps={edgeProps}
      />
    </Svg>
  );
}

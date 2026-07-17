'use client';

// "Forecast Terrain" — the Risk (Fire-Weather What-If) page backdrop. Ported
// from the Claude-Design reference (atmos-engine.jsx + atmos-systems-risk.jsx):
// a self-animating, art-directed wireframe landscape you drift forward through,
// with a glowing horizon and ignited crests. Risk-aware palette tinted toward
// the page's cool/amber "risk" identity (warms as the what-if score climbs).
//
// Kept to the reference's perf budget: a single canvas, ~30fps throttle, DPR≤1.5,
// a static paint under prefers-reduced-motion, and pause when the tab is hidden /
// a modal is open (via the `active` prop, like the Status + Safety backdrops).
// Pinned `fixed` behind the page content; the solid cards scroll over it and it
// shows through the gaps.

import { useEffect, useLayoutEffect, useRef } from 'react';

import { useAesthetic } from '@/lib/aesthetic';
import { type RiskLevel } from '@/lib/theme';

// Runs before paint so a remount/resume never flashes a blank canvas; falls back
// to useEffect during SSR to avoid React's server warning.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Color { r: number; g: number; b: number }

const mix = (a: Color, b: Color, t: number): Color => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});
const rgba = (c: Color, a: number) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;

// Risk-aware base palette (the shared "meaning" seed), tinted toward the cool/
// amber "risk" identity so calm reads cool-blue and extreme reads hot.
const AE_BASE: Record<RiskLevel, [Color, Color, Color]> = {
  low:      [{ r: 90, g: 160, b: 200 }, { r: 110, g: 200, b: 180 }, { r: 80, g: 130, b: 170 }],
  moderate: [{ r: 232, g: 179, b: 57 }, { r: 220, g: 130, b: 60 }, { r: 180, g: 100, b: 70 }],
  high:     [{ r: 255, g: 122, b: 58 }, { r: 240, g: 90, b: 50 }, { r: 200, g: 60, b: 40 }],
  extreme:  [{ r: 255, g: 100, b: 50 }, { r: 240, g: 60, b: 40 }, { r: 180, g: 30, b: 30 }],
};
const AE_COOL: Color = { r: 70, g: 150, b: 232 };
const AE_AMBER: Color = { r: 232, g: 179, b: 57 };

function aePalette(risk: RiskLevel): [Color, Color, Color] {
  const base = AE_BASE[risk] ?? AE_BASE.moderate;
  return [mix(base[0], AE_COOL, 0.64), mix(base[1], AE_COOL, 0.48), mix(base[2], AE_AMBER, 0.55)];
}

interface TerrainOpts {
  colors: [Color, Color, Color];
  intensity: number;
  speedMult: number;
  isAlarming: boolean;
}

// Persisted across route remounts so the camera resumes in place instead of
// snapping back to the start of the drift.
const persisted = { t: 0, curOffset: 0 };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Terrain draw options derived from the current risk band. */
function optsForRisk(risk: RiskLevel): TerrainOpts {
  const isCalm = risk === 'low';
  const isAlarming = risk === 'high' || risk === 'extreme';
  return {
    colors: aePalette(risk),
    intensity: isCalm ? 0.45 : risk === 'moderate' ? 0.78 : 1.0,
    speedMult: 1.1, // 0.4 + (pulseSpeed 70 / 100)
    isAlarming,
  };
}

/** The "terrain" draw system: one coherent sculpted heightfield drawn as draped
 *  contour rows + a translucent surface fill, drifting forward autonomously. */
function makeTerrain(ctx: CanvasRenderingContext2D, initial: TerrainOpts) {
  // Mutable so a risk-band change can be pushed in via setOpts() without
  // rebuilding the whole system (see the component's mount effect).
  let [cCool, cMid, cHot] = initial.colors;
  let { intensity, speedMult, isAlarming } = initial;
  let cValley = mix(cCool, { r: 8, g: 12, b: 24 }, 0.55);

  const ROWS = 10, COLS = 48;
  const VIEW_DEPTH = 7.6;

  let W = 0, H = 0, horizonY = 0;
  let t = persisted.t;
  let curOffset = persisted.curOffset;
  let horizonGrad: CanvasGradient | null = null;
  let sunGrad: CanvasGradient | null = null;

  // One smooth low-frequency heightfield → broad ridges and valleys.
  const heightAt = (gx: number, wz: number) =>
      0.90 * Math.sin(gx * 1.70 + wz * 0.50)
    + 0.58 * Math.sin(wz * 0.72 + gx * 0.95 + 1.3)
    + 0.42 * Math.sin(gx * 2.70 - wz * 0.38 + 0.6)
    + 0.24 * Math.sin(gx * 0.90 + wz * 1.10 + 2.1);

  const build = () => {
    horizonY = H * 0.32;
    horizonGrad = ctx.createLinearGradient(0, horizonY - H * 0.20, 0, horizonY + H * 0.16);
    horizonGrad.addColorStop(0, rgba(cCool, 0));
    horizonGrad.addColorStop(0.46, rgba(cMid, 0.085 * intensity));
    horizonGrad.addColorStop(0.63, rgba(isAlarming ? cHot : cMid, (isAlarming ? 0.32 : 0.22) * intensity));
    horizonGrad.addColorStop(0.74, rgba(cHot, (isAlarming ? 0.24 : 0.13) * intensity));
    horizonGrad.addColorStop(1, rgba(cCool, 0));
    sunGrad = ctx.createRadialGradient(W * 0.5, horizonY, 0, W * 0.5, horizonY, H * 0.5);
    sunGrad.addColorStop(0, rgba(cHot, 0.16 * intensity));
    sunGrad.addColorStop(0.5, rgba(cMid, 0.04 * intensity));
    sunGrad.addColorStop(1, rgba(cMid, 0));
  };

  // Per-row geometry caches — built once per frame, read by both passes.
  const gX: Float32Array[] = [];
  const gY: Float32Array[] = [];
  const gH: Float32Array[] = [];
  const rowHeat = new Float32Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    gX.push(new Float32Array(COLS));
    gY.push(new Float32Array(COLS));
    gH.push(new Float32Array(COLS));
  }

  return {
    resize(w: number, h: number) {
      W = w;
      H = h;
      build();
    },
    setOpts(next: TerrainOpts) {
      [cCool, cMid, cHot] = next.colors;
      cValley = mix(cCool, { r: 8, g: 12, b: 24 }, 0.55);
      ({ intensity, speedMult, isAlarming } = next);
      build(); // refresh the cached gradients for the new palette/intensity
    },
    draw(dt: number) {
      t += dt;
      curOffset += dt * 0.000125 * speedMult;
      persisted.t = t;
      persisted.curOffset = curOffset;
      const swell = Math.sin(t * 0.00012) * 0.06 + 1;

      // Horizon bloom + glow band (additive).
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sunGrad!;
      ctx.fillRect(0, 0, W, horizonY + H * 0.2);
      ctx.fillStyle = horizonGrad!;
      ctx.fillRect(0, horizonY - H * 0.20, W, H * 0.36);

      // Build all row geometry once.
      let prevRowY = horizonY;
      for (let r = 0; r < ROWS; r++) {
        const d = r / (ROWS - 1), dd = Math.pow(d, 1.9);
        const rowY = horizonY + (H * 1.14 - horizonY) * dd;
        const sprd = 0.86 + dd * 0.12;
        const ampPx = (H * 0.030 + dd * H * 0.215) * swell;
        const wz = curOffset + (1 - d) * VIEW_DEPTH;
        const X = gX[r], Y = gY[r], Hh = gH[r];
        let rowMax = -3;
        for (let c = 0; c < COLS; c++) {
          const gx = (c / (COLS - 1)) * 2 - 1;
          const hgt = heightAt(gx, wz);
          if (hgt > rowMax) rowMax = hgt;
          Hh[c] = hgt;
          X[c] = W * 0.5 + gx * (W * 0.60) * sprd;
          Y[c] = rowY - hgt * ampPx;
        }
        // never overlap: clamp each line to stay below the one behind it.
        if (r > 0) {
          const pY = gY[r - 1], minGap = (rowY - prevRowY) * 0.30;
          for (let c = 0; c < COLS; c++) {
            const lim = pY[c] + minGap;
            if (Y[c] < lim) Y[c] = lim;
          }
        }
        prevRowY = rowY;
        rowHeat[r] = rowMax;
      }

      // Pass 1: translucent surface fill (gives the wireframe a body).
      ctx.globalCompositeOperation = 'source-over';
      for (let r = 1; r < ROWS; r++) {
        const d = r / (ROWS - 1);
        const X = gX[r], Y = gY[r], pX = gX[r - 1], pY = gY[r - 1];
        const heat = clamp((rowHeat[r] - 0.15) / 1.5, 0, 1);
        const fillCol = mix(cValley, cHot, heat * (isAlarming ? 0.7 : 0.5));
        const fillA = (0.026 + d * 0.075) * intensity;
        ctx.fillStyle = rgba(fillCol, fillA);
        ctx.beginPath();
        ctx.moveTo(pX[0], pY[0]);
        for (let c = 1; c < COLS; c++) ctx.lineTo(pX[c], pY[c]);
        for (let c = COLS - 1; c >= 0; c--) ctx.lineTo(X[c], Y[c]);
        ctx.closePath();
        ctx.fill();
      }

      // Pass 2: wireframe + ignited crests (additive).
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (let r = 0; r < ROWS; r++) {
        const d = r / (ROWS - 1);
        const X = gX[r], Y = gY[r], Hh = gH[r];
        const depthAlpha = clamp(0.16 + d * 0.78, 0, 0.9);
        const heat = clamp((rowHeat[r] - 0.1) / 1.55, 0, 1);
        const col = mix(mix(cCool, cMid, 0.55), cHot, heat * (isAlarming ? 1 : 0.82));

        ctx.beginPath();
        for (let c = 0; c < COLS; c++) {
          if (c === 0) ctx.moveTo(X[c], Y[c]);
          else ctx.lineTo(X[c], Y[c]);
        }
        ctx.strokeStyle = rgba(col, 0.14 * depthAlpha * intensity);
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = rgba(col, (0.50 + 0.32 * heat) * depthAlpha * intensity);
        ctx.lineWidth = 2.1;
        ctx.stroke();

        if (d > 0.16) {
          for (let c = 0; c < COLS; c++) {
            const peak = clamp((Hh[c] - 0.40) / 1.3, 0, 1);
            if (peak > 0.35) {
              const gr = (1.4 + d * 3.4) * (0.65 + 0.35 * Math.sin(t * 0.0035 + c * 0.7));
              ctx.fillStyle = rgba(cHot, 0.36 * peak * depthAlpha * intensity);
              ctx.beginPath();
              ctx.arc(X[c], Y[c], gr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

export function RiskBackground({
  risk = 'moderate',
  active = true,
}: {
  risk?: RiskLevel;
  /** When false the rAF loop stops and the canvas freezes IN PLACE; flipping
   *  back to true resumes. Lets the parent pause it off-screen / tab-hidden /
   *  behind a modal to cut idle CPU. */
  active?: boolean;
}) {
  const { ae } = useAesthetic();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const wakeRef = useRef<() => void>(() => {});
  const setOptsRef = useRef<(o: TerrainOpts) => void>(() => {});
  // Forces a single static repaint (used when the risk band changes while the
  // rAF loop isn't running — reduced-motion / paused).
  const repaintRef = useRef<() => void>(() => {});
  // Captures the risk at mount for the initial palette, so the mount effect
  // doesn't need `risk` as a dependency (which would rebuild the whole system).
  // Later changes flow through the risk-sync effect via setOpts, not this ref.
  const riskRef = useRef(risk);

  useIsoLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    const FRAME_MS = 1000 / 30;

    // Built once on mount; later risk-band changes are pushed in via
    // sys.setOpts (the risk-sync effect below) so a slider drag that crosses a
    // band doesn't tear down and re-allocate the whole terrain mid-interaction.
    const sys = makeTerrain(ctx, optsForRisk(riskRef.current));
    setOptsRef.current = sys.setOpts;

    let W = 0, H = 0, DPR = 1, raf = 0, last = 0;
    let running = false;

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      sys.resize(W, H);
    };

    const render = (dt: number) => {
      ctx.clearRect(0, 0, W, H);
      sys.draw(dt);
    };

    const frame = (now: number) => {
      // Paused (inactive) → stop the chain and freeze in place.
      if (!activeRef.current) { running = false; return; }
      raf = requestAnimationFrame(frame);
      const elapsed = now - last;
      if (elapsed < FRAME_MS) return;
      last = now;
      render(Math.min(64, elapsed));
    };

    const start = () => {
      if (running || reduced) return;
      if (!activeRef.current) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    // Draw a single static frame with the current palette. Used to refresh the
    // backdrop when the risk band changes while the rAF loop is NOT running
    // (prefers-reduced-motion, or paused) — without it the terrain would stay
    // frozen at its mount-time color and contradict the score. No-op while
    // running, since the loop already repaints every frame.
    const repaint = () => {
      if (!running) render(0);
    };
    wakeRef.current = start;
    repaintRef.current = repaint;

    resize();
    window.addEventListener('resize', resize);

    // React to a live prefers-reduced-motion change (OS setting toggled while
    // the page is open): stop + freeze when it turns on, resume when it turns
    // off. Without this, `reduced` would stay stuck at its mount-time value.
    const onMotionChange = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      if (reduced) stop();
      else start();
    };
    motionQuery.addEventListener('change', onMotionChange);

    // Draw the current (possibly resumed) frame synchronously before paint.
    render(0);
    if (!reduced && activeRef.current) start();

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', onMotionChange);
      wakeRef.current = () => {};
      setOptsRef.current = () => {};
      repaintRef.current = () => {};
    };
  }, []);

  // Pause/resume from the parent without rebuilding the system.
  useEffect(() => {
    activeRef.current = active;
    if (active) wakeRef.current();
  }, [active]);

  // Push palette/intensity changes into the running system instead of
  // rebuilding it, so dragging the sliders across a band boundary stays smooth.
  // Then force a static repaint so the new palette shows even when the rAF loop
  // isn't running (prefers-reduced-motion / paused); it's a no-op while running.
  useEffect(() => {
    setOptsRef.current(optsForRisk(risk));
    repaintRef.current();
  }, [risk]);

  // Static ambience — risk-tuned, behind the canvas.
  const [c0, c1, c2] = aePalette(risk);
  const isAlarming = risk === 'high' || risk === 'extreme';
  const topGlow = rgba(c0, isAlarming ? 0.13 : 0.09);
  const bottomGlow = rgba(c1, isAlarming ? 0.15 : 0.10);
  const sideGlow = rgba(c2, isAlarming ? 0.10 : 0.06);

  return (
    <div
      aria-hidden="true"
      className="app-left-inset"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 248,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 90% 50% at 30% 100%, ${bottomGlow}, transparent 70%),
          radial-gradient(ellipse 70% 40% at 70% -10%, ${topGlow}, transparent 70%),
          radial-gradient(ellipse 40% 80% at 100% 50%, ${sideGlow}, transparent 70%),
          ${ae.bg}
        `,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      {/* Vignette to protect legibility. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 30%, rgba(0,0,0,0.50) 95%)',
        }}
      />
      {/* Top + bottom scrims. */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 160,
          background: `linear-gradient(180deg, ${ae.bg} 0%, rgba(0,0,0,0.0) 100%)`, opacity: 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
          background: `linear-gradient(0deg, ${ae.bg} 5%, rgba(0,0,0,0.0) 100%)`, opacity: 0.7,
        }}
      />
    </div>
  );
}

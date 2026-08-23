'use client';

// The animated waves behind Status. The palette follows the risk, cool and green
// when things are calm and warm when they aren't. With reduced motion on, it
// paints one frame and stops.

import { useEffect, useLayoutEffect, useRef } from 'react';

import { useAesthetic } from '@/lib/aesthetic';
import { type RiskLevel } from '@/lib/theme';

// Runs before paint, so a remount never flashes an empty canvas. Falls back to a
// plain effect on the server, which React warns about otherwise.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Color { r: number; g: number; b: number }

const PALETTES: Record<RiskLevel, Color[]> = {
  low:      [{ r: 90, g: 160, b: 200 }, { r: 110, g: 200, b: 180 }, { r: 80, g: 130, b: 170 }],
  moderate: [{ r: 232, g: 179, b: 57 }, { r: 220, g: 130, b: 60 }, { r: 180, g: 100, b: 70 }],
  high:     [{ r: 255, g: 122, b: 58 }, { r: 240, g: 90, b: 50 }, { r: 200, g: 60, b: 40 }],
  extreme:  [{ r: 255, g: 100, b: 50 }, { r: 240, g: 60, b: 40 }, { r: 180, g: 30, b: 30 }],
};

interface Blob {
  cx: number; cy: number; rad: number;
  ax: number; ay: number; fx: number; fy: number;
  phx: number; phy: number;
  color: Color; alpha: number;
  breathFreq: number; breathPhase: number;
  // Rebuilt on resize and tied to this canvas, so they don't travel with the saved
  // animation state.
  _R?: number; _grad?: CanvasGradient;
}

interface Wave {
  y: number; amp1: number; amp2: number;
  freq1: number; freq2: number;
  speed1: number; speed2: number;
  phase1: number; phase2: number;
  thickness: number;
  color: Color; alpha: number; edgeAlpha: number;
  // Also rebuilt on resize, the band's centerline, its thickness and its fill.
  _yMid?: number; _half?: number; _vgrad?: CanvasGradient;
}

// Kept outside the component so the waves survive navigating away and pick up
// where they left off. Costs nothing while unmounted, the loop is gone.
let persistedSim: { key: string; blobs: Blob[]; waves: Wave[] } | null = null;

export function WavesBackground({
  risk = 'moderate',
  pulseSpeed = 70,
  active = true,
}: {
  risk?: RiskLevel;
  pulseSpeed?: number;
  /** False freezes the canvas where it is, and true picks it up from the same
   *  place. The parent stops it when nobody is looking. */
  active?: boolean;
}) {
  const { ae } = useAesthetic();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const wakeRef = useRef<() => void>(() => {});

  useIsoLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isCalm = risk === 'low';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, DPR = 1;
    let raf = 0;
    let looping = false;

    const colors = PALETTES[risk];
    const intensity = isCalm ? 0.4 : risk === 'moderate' ? 0.75 : 1.0;
    const speedMult = 0.4 + (pulseSpeed / 100) * 1.0;

    // Reusing the saved waves is what makes returning to Status resume, not restart.
    const simKey = `${risk}|${pulseSpeed}`;
    let blobs: Blob[];
    let waves: Wave[];
    if (persistedSim && persistedSim.key === simKey) {
      blobs = persistedSim.blobs;
      waves = persistedSim.waves;
    } else {
      const blobCount = isCalm ? 3 : 4;
      blobs = [];
      for (let i = 0; i < blobCount; i++) {
        blobs.push({
          cx: Math.random(),
          cy: Math.random(),
          rad: 0.45 + Math.random() * 0.35,
          ax: 0.18 + Math.random() * 0.20,
          ay: 0.12 + Math.random() * 0.18,
          fx: (0.00006 + Math.random() * 0.00012) * speedMult,
          fy: (0.00005 + Math.random() * 0.00010) * speedMult,
          phx: Math.random() * Math.PI * 2,
          phy: Math.random() * Math.PI * 2,
          color: colors[i % colors.length],
          alpha: (0.30 + Math.random() * 0.18) * intensity,
          breathFreq: (0.0003 + Math.random() * 0.0004) * speedMult,
          breathPhase: Math.random() * Math.PI * 2,
        });
      }

      const waveCount = isCalm ? 3 : 5;
      waves = [];
      for (let i = 0; i < waveCount; i++) {
        waves.push({
          y: 0.20 + (i / waveCount) * 0.85 + (Math.random() - 0.5) * 0.05,
          amp1: 26 + Math.random() * 36,
          amp2: 14 + Math.random() * 22,
          freq1: 0.0010 + Math.random() * 0.0014,
          freq2: 0.0024 + Math.random() * 0.0030,
          speed1: (0.00012 + Math.random() * 0.00022) * speedMult,
          speed2: (0.00020 + Math.random() * 0.00030) * speedMult,
          phase1: Math.random() * Math.PI * 2,
          phase2: Math.random() * Math.PI * 2,
          thickness: 38 + Math.random() * 56,
          color: colors[i % colors.length],
          alpha: (0.10 + Math.random() * 0.10) * intensity,
          edgeAlpha: (0.30 + Math.random() * 0.25) * intensity,
        });
      }

      persistedSim = { key: simKey, blobs, waves };
    }

    // Gradients only depend on the canvas size, so build them on resize instead of
    // sixty times a second.
    const buildCaches = () => {
      const Rmax = Math.max(W, H);
      for (const b of blobs) {
        const c = b.color;
        b._R = b.rad * Rmax;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b._R);
        g.addColorStop(0,   `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha})`);
        g.addColorStop(0.4, `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha * 0.45})`);
        g.addColorStop(0.7, `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha * 0.15})`);
        g.addColorStop(1,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        b._grad = g;
      }
      for (const w of waves) {
        const c = w.color;
        w._yMid = w.y * H;
        w._half = w.thickness * 0.5;
        const vg = ctx.createLinearGradient(0, w._yMid - w._half, 0, w._yMid + w._half);
        vg.addColorStop(0,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        vg.addColorStop(0.5, `rgba(${c.r}, ${c.g}, ${c.b}, ${w.alpha})`);
        vg.addColorStop(1,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        w._vgrad = vg;
      }
    };

    const resize = () => {
      // Well short of full retina. These are soft gradients with no hard edges, so
      // the difference is invisible while the pixel count drops by nearly half.
      // Going lower did show, spreading the glow.
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildCaches();
    };

    let lastT = performance.now();
    const render = (dt: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // The blobs, drawn from a cached gradient and moved with a transform.
      for (const b of blobs) {
        b.phx += b.fx * dt;
        b.phy += b.fy * dt;
        b.breathPhase += b.breathFreq * dt;
        const cx = (b.cx + Math.sin(b.phx) * b.ax) * W;
        const cy = (b.cy + Math.cos(b.phy) * b.ay) * H;
        const breath = 0.85 + 0.15 * Math.sin(b.breathPhase);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(breath, breath);
        ctx.fillStyle = b._grad!;
        ctx.beginPath();
        ctx.arc(0, 0, b._R!, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // The waves themselves. The path steps in twelves, not eights. Still smooth at
      // this scale and cheaper.
      const step = 12;
      for (const w of waves) {
        w.phase1 += w.speed1 * dt;
        w.phase2 += w.speed2 * dt;
        const yMid = w._yMid!;
        const half = w._half!;
        const c = w.color;

        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off - half;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let x = W + 20; x >= -20; x -= step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off + half;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = w._vgrad!;
        ctx.fill();

        // Three stacked strokes standing in for a real blur. Comes out slightly
        // wider and costs a fraction of the CPU.
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${w.edgeAlpha * 0.10})`;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${w.edgeAlpha * 0.18})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${w.edgeAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    // Half what the display asks for, which halves the work. The motion doesn't
    // slow down. Each frame advances by real elapsed time.
    const FRAME_MS = 1000 / 30;
    const frame = (t: number) => {
      // Paused, so stop and freeze. The wave state lives in the arrays and keeps.
      if (!activeRef.current) { looping = false; return; }
      raf = requestAnimationFrame(frame);
      const elapsed = t - lastT;
      if (elapsed < FRAME_MS) return;
      lastT = t;
      render(Math.min(64, elapsed));
    };

    const start = () => {
      if (looping || reduced) return;
      looping = true;
      lastT = performance.now(); // reset, or the whole pause lands as one giant step
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = start;

    // Refit on any size change. The repaint covers a stopped loop, or the canvas
    // is left blank or stretched.
    const onResize = () => {
      resize();
      if (!looping) render(0);
    };

    resize();
    window.addEventListener('resize', onResize);
    // Watch the element too. A panel opening resizes it without touching window.
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    // Draw one frame now, so a remount never flashes an empty canvas.
    render(0);
    if (!reduced && activeRef.current) {
      start();
    }

    return () => {
      looping = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      wakeRef.current = () => {};
    };
  }, [risk, pulseSpeed]);

  // Pause and resume without rebuilding anything, which would re-seed the waves.
  useEffect(() => {
    activeRef.current = active;
    if (active) wakeRef.current();
  }, [active]);

  const c0 = PALETTES[risk][0];
  const c1 = PALETTES[risk][1];
  const c2 = PALETTES[risk][2];
  const isAlarming = risk === 'high' || risk === 'extreme';
  const isCalm = risk === 'low';
  const topGlow = isCalm
    ? 'rgba(80, 130, 170, 0.06)'
    : `rgba(${c0.r}, ${c0.g}, ${c0.b}, ${isAlarming ? 0.14 : 0.09})`;
  const bottomGlow = isCalm
    ? 'rgba(60, 100, 140, 0.04)'
    : `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${isAlarming ? 0.16 : 0.10})`;
  const sideGlow = `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${isAlarming ? 0.10 : 0.05})`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 30%, rgba(0,0,0,0.50) 95%)',
        }}
      />
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 160,
          background: `linear-gradient(180deg, ${ae.bg} 0%, rgba(0,0,0,0.0) 100%)`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
          background: `linear-gradient(0deg, ${ae.bg} 5%, rgba(0,0,0,0.0) 100%)`,
          opacity: 0.7,
        }}
      />
    </div>
  );
}

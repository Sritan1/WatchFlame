'use client';

// Fire-weather trajectory plot — opens from the Trajectory chip on Status.
// X axis = TIME (now at left → +horizon at right); Y axis = fire-weather (V4)
// score (0 bottom → 1 top). The background is a canvas-rendered "risk strata"
// field: a continuous vertical thermal gradient where each fire-weather tier
// (LOW/MOD/HIGH/EXT) owns a color and the calibrated thresholds are the
// *centers* of soft transition zones, with glowing seams + atmospheric bloom.
// It reads like stacked thermal strata rather than tiled bands.
//
// IMPORTANT — the strata is DYNAMIC: every threshold (the feather centers, the
// seam positions, the dashed boundary lines, the y-axis ticks/badges) is driven
// by `regionalThresholds` (the user's per-state calibration). Change location /
// calibration and the whole field re-layers to match. Adapted from a canvas
// reference; rendering is static (no animation loop) for performance, with an
// offscreen cache so hover stays cheap.
//
// The composite/active-fire-threat story is preserved in the summary below the
// plot (tier-crossing callout + headline), not in the band colors.
//
// Option B for the OWM/Open-Meteo "now" mismatch: the curve + scores are
// anchored to the orb's Status score (multiplicative, preserves % deltas), and
// the "Now" tile shows the Status (OpenWeatherMap) temp/RH/wind.

import { useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';

import { DataErrorState } from '@/components/ui/DataErrorState';
import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds, TrajectoryResponse, TrajectoryTier } from '@/lib/api';
import { formatSpeed, formatTemp, useUnits } from '@/lib/use-units';
import { bucketOf, compositeFromBuckets, normalizeWeather } from '@/lib/composite-risk';
import { type RiskLevel } from '@/lib/theme';

const TIER_TONE: Record<TrajectoryTier, { color: string; rgb: string; label: string }> = {
  rising:  { color: '#FF7A3A', rgb: '255, 122, 58',  label: 'Rising' },
  steady:  { color: '#9ca3af', rgb: '156, 163, 175', label: 'Steady' },
  falling: { color: '#3FB68B', rgb: '63, 182, 139',  label: 'Falling' },
};

const TIER_SHORT: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MOD',
  high: 'HIGH',
  extreme: 'EXT',
};

// ── Risk-strata rendering constants (the "classic" thermal palette, depth 0.6,
//    softness 0.036 — the reference settings we standardized on). ────────────
type RGB = readonly number[];
// Distinct, saturated thermal nodes so all four tiers read clearly. The
// previous MOD was an olive [168,168,52] that bled into both the green LOW
// and the orange HIGH; a clean golden-yellow plus a punchier orange give each
// tier its own identity while the feathered transitions keep it a gradient.
const STRATA = {
  low: [42, 168, 102] as RGB,    // emerald green
  mod: [240, 206, 60] as RGB,    // golden yellow
  high: [243, 118, 34] as RGB,   // vivid orange
  ext: [220, 46, 48] as RGB,     // red
  extDeep: [112, 24, 46] as RGB, // deep crimson falloff
  glow: [255, 188, 98] as RGB,
  seam: [255, 212, 132] as RGB,
};
const BASE_INK: RGB = [12, 10, 9];
const DEPTH = 0.6;
const SOFTNESS = 0.046;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
function saturate(c: RGB, k: number): RGB {
  const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return [g + (c[0] - g) * k, g + (c[1] - g) * k, g + (c[2] - g) * k];
}
const rgbStr = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

interface Bounds {
  low: number;
  moderate: number;
  extreme: number;
}

/** Continuous strata color at a fire-weather score, feathering each tier color
 *  into the next across the user's calibrated thresholds. */
function strataColor(score: number, b: Bounds, f: number): RGB {
  let c: RGB = STRATA.low;
  c = mix(c, STRATA.mod, smoothstep(b.low - f, b.low + f, score));
  c = mix(c, STRATA.high, smoothstep(b.moderate - f, b.moderate + f, score));
  c = mix(c, STRATA.ext, smoothstep(b.extreme - f, b.extreme + f, score));
  // deepen the upper-extreme region into crimson for cinematic falloff
  c = mix(c, STRATA.extDeep, smoothstep(b.extreme + 0.03, 1.0, score) * 0.82);
  // settle the very floor so the low tier has depth too
  c = mix(c, mix(c, BASE_INK, 0.4), smoothstep(0.12, 0.0, score));
  return saturate(c, 1.24);
}

function buildNoise(): HTMLCanvasElement {
  const n = document.createElement('canvas');
  n.width = n.height = 140;
  const nctx = n.getContext('2d')!;
  const img = nctx.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + (Math.random() * 74 - 37);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  return n;
}

// Catmull-Rom → bezier smoothing for the forecast curve.
function smoothPath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function PhaseSpaceModal({
  open,
  onClose,
  weatherBucket,
  threatBucket,
  trajectory,
  regionalThresholds,
  currentWeatherScore,
  currentConditions,
  error = false,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  weatherBucket: RiskLevel | null;
  threatBucket: RiskLevel | null;
  trajectory: TrajectoryResponse | null | undefined;
  regionalThresholds: RegionalThresholds | null;
  currentWeatherScore: number | null;
  currentConditions: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKph: number | null;
  };
  /** The /trajectory query errored (vs. the backend gracefully returning null
   *  for a location with no forecast). Drives a failure-specific message + Retry. */
  error?: boolean;
  onRetry?: () => void;
}) {
  const { ae } = useAesthetic();

  // ── Option B anchoring ──────────────────────────────────────────────────
  const frames = useMemo(() => trajectory?.frames ?? [], [trajectory]);
  const horizon = trajectory?.horizon_hours ?? (frames.length > 0 ? frames.length - 1 : 6);
  const anchorScale = useMemo(() => {
    const omNow = frames[0]?.v4_score;
    if (currentWeatherScore == null || omNow == null || omNow <= 0.01) return 1;
    return currentWeatherScore / omNow;
  }, [frames, currentWeatherScore]);
  const anchoredScores = useMemo(
    () => frames.map((f) => clamp01(f.v4_score * anchorScale)),
    [frames, anchorScale],
  );
  const anchoredNow = anchoredScores[0] ?? currentWeatherScore ?? null;
  const anchoredProjected =
    anchoredScores.length > 0 ? anchoredScores[anchoredScores.length - 1] : null;

  const projectedWeatherBucket = useMemo<RiskLevel | null>(() => {
    if (anchoredProjected == null) return null;
    return bucketOf(normalizeWeather(anchoredProjected, regionalThresholds));
  }, [anchoredProjected, regionalThresholds]);

  const currentComposite = useMemo(
    () => compositeFromBuckets(weatherBucket, threatBucket),
    [weatherBucket, threatBucket],
  );
  const projectedComposite = useMemo(
    () => compositeFromBuckets(projectedWeatherBucket, threatBucket),
    [projectedWeatherBucket, threatBucket],
  );

  return (
    <Modal open={open} onClose={onClose} eyebrow="Trajectory" title="Where you are, where you're heading" maxWidth={720}>
      {/* On a forecast fetch failure, lead with a prominent callout + Retry —
          the failure is the headline, not a footnote. The plot below still
          renders the (accurate) "now" position. */}
      {error ? (
        <div style={{ marginBottom: 18 }}>
          <DataErrorState
            title="Forecast unavailable"
            message="Couldn’t load the 6-hour forecast — check your connection and try again. Your current position (the bright dot) is still accurate — only the projected trend is missing."
            onRetry={onRetry}
          />
        </div>
      ) : null}
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: ae.textDim,
        }}
      >
        <strong style={{ color: ae.text }}>Time</strong> runs left (now) → right (+{horizon} hr). Your{' '}
        <strong style={{ color: ae.text }}>fire-weather</strong> score runs bottom → top. The thermal
        strata are your location&apos;s <strong style={{ color: ae.text }}>calibrated tier
        thresholds</strong> — the hour the forecast curve rises into a hotter band is the hour your
        fire-weather tier would shift.
      </p>

      <div style={{ marginTop: 18 }}>
        <TrajectoryPlot
          ae={ae}
          anchoredScores={anchoredScores}
          horizon={horizon}
          currentScore={anchoredNow}
          trajectoryTier={trajectory?.tier ?? null}
          regionalThresholds={regionalThresholds}
        />
      </div>

      {trajectory ? (
        <TrajectorySummary
          ae={ae}
          trajectory={trajectory}
          anchoredNow={anchoredNow}
          anchoredProjected={anchoredProjected}
          currentComposite={currentComposite}
          projectedComposite={projectedComposite}
          currentConditions={currentConditions}
        />
      ) : error ? null : (
        <p
          style={{
            marginTop: 16,
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            color: ae.textMute,
            lineHeight: 1.5,
          }}
        >
          Forecast trajectory unavailable for this location right now — your current position (the
          bright dot) is still accurate.
        </p>
      )}
    </Modal>
  );
}

// ─── Canvas strata plot ────────────────────────────────────────────────────

type Ae = ReturnType<typeof useAesthetic>['ae'];

function TrajectoryPlot({
  ae,
  anchoredScores,
  horizon,
  currentScore,
  trajectoryTier,
  regionalThresholds,
}: {
  ae: Ae;
  anchoredScores: number[];
  horizon: number;
  currentScore: number | null;
  trajectoryTier: TrajectoryTier | null;
  regionalThresholds: RegionalThresholds | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);   // offscreen static layer
  const noiseRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const bounds: Bounds = useMemo(
    () => ({
      low: regionalThresholds?.low ?? 0.3,
      moderate: regionalThresholds?.moderate ?? 0.6,
      extreme: regionalThresholds?.extreme ?? 0.8,
    }),
    [regionalThresholds],
  );
  const tone = trajectoryTier ? TIER_TONE[trajectoryTier] : null;

  // Stash the draw inputs in a ref so the resize/draw callbacks stay stable.
  const dataRef = useRef({ anchoredScores, horizon, currentScore, bounds, tone, ae });
  dataRef.current = { anchoredScores, horizon, currentScore, bounds, tone, ae };

  if (!noiseRef.current && typeof document !== 'undefined') noiseRef.current = buildNoise();

  /** Draw all static layers (everything except the hover crosshair) to the
   *  offscreen base canvas at the current CSS size. */
  const renderBase = useCallback(() => {
    const { w: W, h: H, dpr } = sizeRef.current;
    if (!W || !H) return;
    if (!baseRef.current) baseRef.current = document.createElement('canvas');
    const base = baseRef.current;
    base.width = Math.round(W * dpr);
    base.height = Math.round(H * dpr);
    const ctx = base.getContext('2d');
    if (!ctx) return;
    const { anchoredScores: scores, horizon: hz, currentScore: cur, bounds: b, tone: tn } = dataRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const yOf = (s: number) => (1 - clamp01(s)) * H;
    const xOf = (frac: number) => clamp01(frac) * W;
    const lineColor = tn?.color ?? 'rgba(255,255,255,0.85)';
    const lineRgb = tn?.rgb ?? '255, 255, 255';

    // warm-black base
    ctx.fillStyle = rgbStr(BASE_INK);
    ctx.fillRect(0, 0, W, H);

    // layered strata — one continuous vertical gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const NS = 96;
    for (let k = 0; k <= NS; k++) {
      const off = k / NS;
      const score = 1 - off; // canvas top = score 1
      const c = mix(BASE_INK, strataColor(score, b, SOFTNESS), 0.93);
      grad.addColorStop(off, rgbStr(c));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // glowing ignition seams along each calibrated boundary
    const threshList = [b.low, b.moderate, b.extreme];
    const seamPeaks = [0.34, 0.45, 0.62].map((p) => p * DEPTH);
    const sw = Math.min(0.14, Math.max(0.05, SOFTNESS * 3.0));
    ctx.globalCompositeOperation = 'lighter';
    threshList.forEach((t, i) => {
      const yTop = yOf(Math.min(1, t + sw));
      const yBot = yOf(Math.max(0, t - sw));
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      const a = seamPeaks[i];
      g.addColorStop(0, `rgba(${STRATA.seam[0]},${STRATA.seam[1]},${STRATA.seam[2]},0)`);
      g.addColorStop(0.5, `rgba(${STRATA.seam[0]},${STRATA.seam[1]},${STRATA.seam[2]},${a})`);
      g.addColorStop(1, `rgba(${STRATA.seam[0]},${STRATA.seam[1]},${STRATA.seam[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    ctx.globalCompositeOperation = 'source-over';

    // atmospheric low-frequency bloom (static soft glows)
    ctx.globalCompositeOperation = 'lighter';
    const blobs = [
      { fx: 0.2, fs: Math.min(0.98, b.extreme + 0.3), r: 0.66, a: 0.16, c: STRATA.ext },
      { fx: 0.8, fs: Math.min(0.96, b.extreme + 0.16), r: 0.74, a: 0.14, c: STRATA.glow },
      { fx: 0.5, fs: 0.1, r: 0.56, a: 0.16, c: STRATA.glow },
      { fx: 0.32, fs: b.moderate, r: 0.5, a: 0.12, c: STRATA.seam },
    ];
    for (const blob of blobs) {
      const gx = blob.fx * W;
      const gy = yOf(blob.fs);
      const rr = blob.r * Math.max(W, H);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
      const a = blob.a * DEPTH;
      g.addColorStop(0, `rgba(${blob.c[0]},${blob.c[1]},${blob.c[2]},${a})`);
      g.addColorStop(0.5, `rgba(${blob.c[0]},${blob.c[1]},${blob.c[2]},${a * 0.34})`);
      g.addColorStop(1, `rgba(${blob.c[0]},${blob.c[1]},${blob.c[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // core light bloom through the upper transition zone
    const cy = yOf(b.extreme);
    const cg = ctx.createRadialGradient(W * 0.5, cy, 0, W * 0.5, cy, Math.max(W, H) * 0.7);
    cg.addColorStop(0, `rgba(${STRATA.glow[0]},${STRATA.glow[1]},${STRATA.glow[2]},${0.14 * DEPTH})`);
    cg.addColorStop(0.55, `rgba(${STRATA.glow[0]},${STRATA.glow[1]},${STRATA.glow[2]},${0.04 * DEPTH})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
    // directional sheen (soft light from upper-left)
    const sh = ctx.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0, `rgba(255,236,210,${0.05 * DEPTH})`);
    sh.addColorStop(0.45, 'rgba(255,236,210,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // fine grain for depth
    if (noiseRef.current) {
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = 'overlay';
      const tile = noiseRef.current;
      for (let x = 0; x < W; x += tile.width) {
        for (let y = 0; y < H; y += tile.height) ctx.drawImage(tile, x, y);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // edge vignette for premium falloff
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'rgba(0,0,0,0.22)');
    vg.addColorStop(0.35, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // vertical time gridlines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let h = 1; h < hz; h++) {
      const x = Math.round(xOf(h / hz)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    // calibrated threshold lines (dashed) — the data boundaries
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(255,240,218,0.27)';
    for (const t of threshList) {
      const y = Math.round(yOf(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // plot border
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // ── forecast curve ──
    const hasSeries = scores.length >= 2;
    if (hasSeries) {
      const pts: [number, number][] = scores.map((s, i) => [xOf(i / hz), yOf(s)]);

      // soft area fill under the curve
      const area = ctx.createLinearGradient(0, yOf(Math.max(...scores) + 0.05), 0, H);
      area.addColorStop(0, 'rgba(255,255,255,0.10)');
      area.addColorStop(1, 'rgba(255,255,255,0.0)');
      ctx.beginPath();
      ctx.moveTo(pts[0][0], H);
      ctx.lineTo(pts[0][0], pts[0][1]);
      smoothPath(ctx, pts);
      ctx.lineTo(pts[pts.length - 1][0], H);
      ctx.closePath();
      ctx.fillStyle = area;
      ctx.fill();

      // curve line — white for readability over the thermal field, tier glow
      ctx.save();
      ctx.shadowColor = `rgba(${lineRgb}, 0.7)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      smoothPath(ctx, pts);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // node dots
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      }

      // +horizon projected dot (tier-colored) + arrowhead + label
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      ctx.save();
      ctx.shadowColor = `rgba(${lineRgb}, 0.8)`;
      ctx.shadowBlur = 10;
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(last[0], last[1], 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(last[0] + 9 * Math.cos(ang), last[1] + 9 * Math.sin(ang));
      ctx.lineTo(last[0] - 5 * Math.cos(ang - 0.6), last[1] - 5 * Math.sin(ang - 0.6));
      ctx.lineTo(last[0] - 5 * Math.cos(ang + 0.6), last[1] - 5 * Math.sin(ang + 0.6));
      ctx.closePath();
      ctx.fill();
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = lineColor;
      ctx.fillText(`+${hz} HR`, last[0] - 10, last[1] - 12);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // NOW dot — bright halo at the left edge
    if (cur != null) {
      const nx = xOf(0);
      const ny = yOf(cur);
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(nx, ny, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(nx, ny, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('NOW', nx + 16, ny - 12);
      ctx.restore();
    }
  }, []);

  /** Blit the cached base, then draw the hover crosshair + readout. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext('2d');
    const { w: W, h: H, dpr } = sizeRef.current;
    if (!ctx || !W || !H) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);

    const mo = mouseRef.current;
    if (!mo) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { bounds: b } = dataRef.current;
    const score = clamp01(1 - mo.y / H);
    const hourF = clamp01(mo.x / W) * horizon;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(mo.x, 0);
    ctx.lineTo(mo.x, H);
    ctx.moveTo(0, mo.y);
    ctx.lineTo(W, mo.y);
    ctx.stroke();
    ctx.setLineDash([]);
    let tier = 'LOW';
    if (score >= b.extreme) tier = 'EXTREME';
    else if (score >= b.moderate) tier = 'HIGH';
    else if (score >= b.low) tier = 'MODERATE';
    const lines = [`+${hourF.toFixed(1)}h  ·  ${score.toFixed(3)}`, tier];
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    const cw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    const ch = 34;
    let bx = mo.x + 12;
    let by = mo.y + 12;
    if (bx + cw > W) bx = mo.x - cw - 12;
    if (by + ch > H) by = mo.y - ch - 12;
    roundRect(ctx, bx, by, cw, ch, 6);
    ctx.fillStyle = 'rgba(8,10,11,0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(lines[0], bx + 9, by + 11);
    ctx.fillStyle = 'rgba(255,225,200,0.95)';
    ctx.fillText(lines[1], bx + 9, by + 24);
    ctx.textBaseline = 'alphabetic';
  }, [horizon]);

  const redraw = useCallback(() => {
    renderBase();
    paint();
  }, [renderBase, paint]);

  // Redraw whenever the data changes.
  useEffect(() => {
    redraw();
  }, [redraw, anchoredScores, horizon, currentScore, bounds, tone]);

  // Sizing — DPR-aware, ResizeObserver + poll fallback.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let lastW = -1;
    let lastH = -1;
    const measure = () => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (!cw || !ch || (cw === lastW && ch === lastH)) return;
      lastW = cw;
      lastH = ch;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      sizeRef.current = { w: cw, h: ch, dpr };
      redraw();
    };
    measure();
    const poll = setInterval(measure, 200);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(wrap);
    }
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(poll);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [redraw]);

  const onMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    paint();
  };
  const onLeave = () => {
    mouseRef.current = null;
    paint();
  };

  // Y-axis ticks + tier badges, positioned by the dynamic thresholds.
  const yNums = [
    { v: 0, lbl: '0.00' },
    { v: bounds.low, lbl: bounds.low.toFixed(2) },
    { v: bounds.moderate, lbl: bounds.moderate.toFixed(2) },
    { v: bounds.extreme, lbl: bounds.extreme.toFixed(2) },
    { v: 1, lbl: '1.00' },
  ];
  const yTiers = [
    { lbl: 'EXT', c: (bounds.extreme + 1) / 2 },
    { lbl: 'HIGH', c: (bounds.moderate + bounds.extreme) / 2 },
    { lbl: 'MOD', c: (bounds.low + bounds.moderate) / 2 },
    { lbl: 'LOW', c: bounds.low / 2 },
  ];
  const xLabels = Array.from({ length: horizon + 1 }, (_, h) => h).filter((h) => h === 0 || h % 2 === 0);

  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 50px 1fr',
        gridTemplateRows: '1fr 22px 20px',
        height: 384,
        background: '#080b0c',
        border: `0.5px solid ${ae.line}`,
        borderRadius: 14,
        padding: '20px 22px 14px 14px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Y axis title (rotated) */}
      <div style={{ gridColumn: 1, gridRow: 1, position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%) rotate(-90deg)',
            whiteSpace: 'nowrap',
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: ae.text,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}
        >
          FIRE-WEATHER SCORE
        </span>
      </div>

      {/* Y gutter — numeric ticks (right) + tier badges (left) */}
      <div style={{ gridColumn: 2, gridRow: 1, position: 'relative' }}>
        {yNums.map((t) => (
          <span
            key={`yn-${t.lbl}`}
            style={{
              position: 'absolute',
              right: 8,
              top: `${(1 - t.v) * 100}%`,
              transform: 'translateY(-50%)',
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: ae.textDim,
              textShadow: '0 1px 3px rgba(0,0,0,0.75)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.lbl}
          </span>
        ))}
        {yTiers.map((t) => (
          <span
            key={`yt-${t.lbl}`}
            style={{
              position: 'absolute',
              left: 2,
              top: `${(1 - t.c) * 100}%`,
              transform: 'translateY(-50%)',
              fontFamily: mono,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.9)',
              textShadow: '0 1px 4px rgba(0,0,0,0.85)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.lbl}
          </span>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        style={{ gridColumn: 3, gridRow: 1, position: 'relative', borderRadius: 6, overflow: 'hidden' }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        />
      </div>

      {/* X labels */}
      <div style={{ gridColumn: 3, gridRow: 2, position: 'relative' }}>
        {xLabels.map((h) => (
          <span
            key={`xl-${h}`}
            style={{
              position: 'absolute',
              top: 7,
              left: `${(h / horizon) * 100}%`,
              transform: h === 0 ? 'translateX(0)' : h === horizon ? 'translateX(-100%)' : 'translateX(-50%)',
              fontFamily: mono,
              fontSize: 10,
              fontWeight: h === 0 ? 800 : 600,
              letterSpacing: '0.06em',
              color: h === 0 ? ae.text : ae.textDim,
              textShadow: '0 1px 3px rgba(0,0,0,0.75)',
            }}
          >
            {h === 0 ? 'NOW' : `+${h}h`}
          </span>
        ))}
      </div>

      {/* X title */}
      <div
        style={{
          gridColumn: 3,
          gridRow: 3,
          textAlign: 'center',
          fontFamily: mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: ae.text,
          textShadow: '0 1px 3px rgba(0,0,0,0.7)',
        }}
      >
        TIME&nbsp;&nbsp;➝
      </div>
    </div>
  );
}

// ─── Below-plot summary ──────────────────────────────────────────────────

function TrajectorySummary({
  ae,
  trajectory,
  anchoredNow,
  anchoredProjected,
  currentComposite,
  projectedComposite,
  currentConditions,
}: {
  ae: Ae;
  trajectory: TrajectoryResponse;
  anchoredNow: number | null;
  anchoredProjected: number | null;
  currentComposite: RiskLevel | null;
  projectedComposite: RiskLevel | null;
  currentConditions: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKph: number | null;
  };
}) {
  const tone = TIER_TONE[trajectory.tier];
  const willCrossTier =
    currentComposite != null &&
    projectedComposite != null &&
    currentComposite !== projectedComposite;

  const driverLabel = {
    vpd: 'vapor pressure deficit',
    wind: 'wind',
    humidity: 'humidity',
  }[trajectory.dominant_driver];

  const horizon = trajectory.horizon_hours;
  const deltaSign = trajectory.delta_pct > 0 ? '+' : '';
  const deltaText = `${deltaSign}${trajectory.delta_pct.toFixed(1)}%`;

  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Headline trajectory callout */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: `linear-gradient(180deg, rgba(${tone.rgb}, 0.14), rgba(${tone.rgb}, 0.04))`,
          border: `0.5px solid rgba(${tone.rgb}, 0.42)`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 8,
            height: 38,
            borderRadius: 6,
            background: tone.color,
            boxShadow: `0 0 10px ${tone.color}`,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: ae.textMute,
              textTransform: 'uppercase',
            }}
          >
            Next {horizon} hours
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: ae.fontDisplay,
              fontSize: 15,
              fontWeight: 700,
              color: ae.text,
              letterSpacing: '-0.01em',
            }}
          >
            <span style={{ color: tone.color }}>{tone.label}</span>{' '}
            <span style={{ color: ae.textMute, fontWeight: 500 }}>·</span>{' '}
            Fire-weather score {deltaText}, driven by {driverLabel}
          </div>
        </div>
      </div>

      {/* Tier-crossing callout — only when projected tier differs from current */}
      {willCrossTier && currentComposite && projectedComposite ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${ae.line}`,
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            color: ae.textDim,
            lineHeight: 1.55,
          }}
        >
          Headline tier projected to shift from{' '}
          <strong style={{ color: ae.text, fontFamily: ae.fontMono, letterSpacing: '0.06em' }}>
            {TIER_SHORT[currentComposite]}
          </strong>{' '}
          →{' '}
          <strong style={{ color: ae.text, fontFamily: ae.fontMono, letterSpacing: '0.06em' }}>
            {TIER_SHORT[projectedComposite]}
          </strong>{' '}
          over the next {horizon} hours — the hour the curve crosses that band edge.
        </div>
      ) : null}

      {/* "Now" = your current Status reading (matches the cards); "+horizon" =
          the Open-Meteo forecast it's heading toward. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
        <FrameTile
          ae={ae}
          label="Now"
          tempC={currentConditions.temperatureC}
          humidityPct={currentConditions.humidityPct}
          windKph={currentConditions.windKph}
          v4Score={anchoredNow}
        />
        <FrameTile
          ae={ae}
          label={`+${horizon} hr`}
          tempC={trajectory.projected.temperature_c}
          humidityPct={trajectory.projected.humidity_pct}
          windKph={trajectory.projected.wind_kph}
          v4Score={anchoredProjected}
        />
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 11,
          lineHeight: 1.5,
          color: ae.textMute,
          fontStyle: 'italic',
        }}
      >
        &ldquo;Now&rdquo; is your current Status reading — the +{horizon} hr projection is
        Open-Meteo&apos;s hourly forecast, and the trajectory tier reflects its now-vs-projected
        change.
      </p>
    </div>
  );
}

function FrameTile({
  ae,
  label,
  tempC,
  humidityPct,
  windKph,
  v4Score,
}: {
  ae: Ae;
  label: string;
  tempC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  v4Score: number | null;
}) {
  const units = useUnits();
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 12,
          rowGap: 4,
          fontFamily: ae.fontMono,
          fontSize: 11,
          color: ae.textDim,
        }}
      >
        <span style={{ color: ae.textMute }}>Temp</span>
        <span style={{ color: ae.text }}>{tempC != null ? formatTemp(tempC, units.temp, 0) : '—'}</span>
        <span style={{ color: ae.textMute }}>RH</span>
        <span style={{ color: ae.text }}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</span>
        <span style={{ color: ae.textMute }}>Wind</span>
        <span style={{ color: ae.text }}>{windKph != null ? formatSpeed(windKph, units.speed, 0) : '—'}</span>
        <span style={{ color: ae.textMute }}>Fire-weather score</span>
        <span style={{ color: ae.text, fontWeight: 700 }}>{v4Score != null ? v4Score.toFixed(2) : '—'}</span>
      </div>
    </div>
  );
}

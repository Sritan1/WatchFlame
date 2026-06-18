'use client';

// Wildfire Intelligence — the three "brain" cards of the Command Center,
// art-directed as the visual centerpiece. Translated from the reference design
// (web-hero-systems.jsx) into the app's real primitives + live data:
//   • HeroScoreCard  — Fire Weather / Active Fire Threat, a 270° instrument gauge
//                      with a calibrated zone arc + readout (real risk_score /
//                      threat signal + regional zone boundaries).
//   • IgnitionCoreCard — the ML "intelligence core": orbiting neural rings, a
//                      predictive distribution curve, and a HUD readout, driven
//                      by the /ignition model output.
//   • IntelligenceSystem — wraps all three in one shared atmospheric stage.
//
// Everything preserves the underlying data; only the presentation is elevated.
// Loading + failed/unavailable states are handled per card.

import { useMemo, useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { IgnitionInfoModal } from '@/components/status/IgnitionInfoModal';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import type { IgnitionResponse } from '@/lib/api';
import {
  type AccentHue,
  getRisk,
  hexToRgb,
  RISK_LEVELS,
  type RiskLevel,
  type RiskTone,
} from '@/lib/theme';

type Ae = ReturnType<typeof useAesthetic>['ae'];

// Per design, MODERATE is the base visual theme: a card reading `low` or `none`
// still renders with the moderate (amber) chrome rather than green / grey. Only
// the small level chip + the active zone label reflect the true tier (so LOW
// still reads green there). High + extreme pass through unchanged.
function chromeBucketOf(bucket: RiskLevel | null): RiskLevel {
  return bucket && bucket !== 'low' ? bucket : 'moderate';
}

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  extreme: 'EXTREME',
};

// Glossy nucleus highlight per level (keeps the "molten core" look across tiers).
const CORE_HIGHLIGHT: Record<RiskLevel, string> = {
  low: '#86E6B8',
  moderate: '#FFD66B',
  high: '#FFC08A',
  extreme: '#FF9E84',
};

function paletteFor(level: RiskLevel, accent: AccentHue): RiskTone {
  return level === 'low' || level === 'moderate' ? RISK_LEVELS[level] : getRisk(level, accent);
}

function ordinalSuffix(n: number): string {
  const v = Math.round(n) % 100;
  if (v >= 11 && v <= 13) return 'th';
  return (['th', 'st', 'nd', 'rd'][v % 10] as string) || 'th';
}

// ── geometry helpers (deg: 0 = top, clockwise positive) ──────────────────────
function hsPolar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}
function hsArc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = hsPolar(cx, cy, r, a0);
  const [x1, y1] = hsPolar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ── shared cinematic chrome ──────────────────────────────────────────────────
function HsBeam({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 16px ${color}`,
        animation: 'hs-beam 4.5s ease-in-out infinite',
      }}
    />
  );
}

function HsHudCorners({ color, inset = 14, len = 18 }: { color: string; inset?: number; len?: number }) {
  const c: React.CSSProperties = { position: 'absolute', width: len, height: len, pointerEvents: 'none', opacity: 0.55 };
  const line = `1px solid ${color}`;
  return (
    <>
      <div aria-hidden style={{ ...c, top: inset, left: inset, borderTop: line, borderLeft: line, borderTopLeftRadius: 4 }} />
      <div aria-hidden style={{ ...c, top: inset, right: inset, borderTop: line, borderRight: line, borderTopRightRadius: 4 }} />
      <div aria-hidden style={{ ...c, bottom: inset, left: inset, borderBottom: line, borderLeft: line, borderBottomLeftRadius: 4 }} />
      <div aria-hidden style={{ ...c, bottom: inset, right: inset, borderBottom: line, borderRight: line, borderBottomRightRadius: 4 }} />
    </>
  );
}

function HsAtmosphere({ glow }: { glow: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 80% at 50% -10%, rgba(${glow}, 0.16), transparent 60%), radial-gradient(90% 60% at 110% 120%, rgba(${glow}, 0.10), transparent 60%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          right: '-15%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          filter: 'blur(60px)',
          background: `radial-gradient(circle, rgba(${glow}, 0.22), transparent 70%)`,
          animation: 'hs-blob-a 16s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-35%',
          left: '-10%',
          width: 280,
          height: 280,
          borderRadius: '50%',
          filter: 'blur(60px)',
          background: `radial-gradient(circle, rgba(${glow}, 0.14), transparent 70%)`,
          animation: 'hs-blob-b 20s ease-in-out infinite',
        }}
      />
      <GridPattern opacity={0.04} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          background: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.012) 3px 4px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 120% at 50% 40%, transparent 55%, rgba(0,0,0,0.45) 100%)',
        }}
      />
    </div>
  );
}

function HsToneChip({ ae, color, glow, label, dot = true }: { ae: Ae; color: string; glow: string; label: string; dot?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 12px 6px 10px',
        borderRadius: 99,
        background: `linear-gradient(180deg, rgba(${glow}, 0.20), rgba(${glow}, 0.06))`,
        border: `0.5px solid rgba(${glow}, 0.40)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 18px rgba(${glow}, 0.14)`,
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.16em',
        color,
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
      }}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 99, background: color, boxShadow: `0 0 8px ${color}` }} /> : null}
      {label}
    </span>
  );
}

// ── HsRiskGauge — 270° instrument gauge with calibrated zone arc + readout ────
type Zone = { to: number; color: string; lbl: string };

function HsRiskGauge({
  ae,
  frac,
  zones,
  palette,
  score,
  scoreMax,
  hasScore,
  loading,
  emptyText,
}: {
  ae: Ae;
  frac: number;
  zones: Zone[];
  palette: RiskTone;
  score: number | null;
  scoreMax: number;
  hasScore: boolean;
  loading: boolean;
  emptyText: string;
}) {
  const size = 200;
  const cx = 100;
  const cy = 106;
  const r = 80;
  const rTick = 90;
  const A0 = -135;
  const SWEEP = 270;
  const deg = (t: number) => A0 + Math.min(1, Math.max(0, t)) * SWEEP;
  const scoreDeg = deg(frac);
  const [ex, ey] = hsPolar(cx, cy, r, scoreDeg);

  const ticks: React.ReactNode[] = [];
  const NT = 31;
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    const d = deg(t);
    const long = i % 5 === 0;
    const [x1, y1] = hsPolar(cx, cy, rTick, d);
    const [x2, y2] = hsPolar(cx, cy, rTick - (long ? 9 : 5), d);
    ticks.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ae.text} strokeOpacity={long ? 0.3 : 0.12} strokeWidth={long ? 0.9 : 0.5} />,
    );
  }

  let prev = 0;
  const segs = zones.map((z) => {
    const p = prev;
    prev = z.to;
    return { d: hsArc(cx, cy, r, deg(p), deg(z.to)), c: z.color };
  });
  const activeArc = hsArc(cx, cy, r, A0, scoreDeg);
  const gid = `hs-g-${palette.color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={palette.color} stopOpacity="1" />
          </linearGradient>
        </defs>
        {ticks}
        {segs.map((s, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <path key={i} d={s.d} fill="none" stroke={`rgba(${hexToRgb(s.c)}, 0.16)`} strokeWidth="7" strokeLinecap="butt" />
        ))}
        {hasScore ? (
          <>
            <path
              d={activeArc}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth="7"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              style={{ filter: `drop-shadow(0 0 9px ${palette.color})`, animation: 'hs-draw1 1.4s cubic-bezier(0.3,0.9,0.3,1) both' }}
            />
            <circle
              className="hs-marker-ring"
              cx={ex}
              cy={ey}
              r="9"
              fill="none"
              stroke={palette.color}
              strokeWidth="1"
              style={{ transformOrigin: `${ex}px ${ey}px`, animation: 'hs-markerpulse 2.4s ease-out infinite' }}
            />
            <circle cx={ex} cy={ey} r="4.5" fill={palette.color} style={{ filter: `drop-shadow(0 0 8px ${palette.color})` }} />
            <circle cx={ex} cy={ey} r="1.8" fill="#fff" />
          </>
        ) : null}
        <circle cx={cx} cy={cy} r="3" fill={ae.textMute} opacity="0.5" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: cy - 34,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <span style={{ fontFamily: ae.fontMono, fontSize: 8.5, letterSpacing: '0.28em', color: ae.textMute, textTransform: 'uppercase' }}>
          Index
        </span>
        {loading ? (
          <div style={{ margin: '4px 0' }}>
            <Skeleton width={84} height={40} rounded="md" />
          </div>
        ) : hasScore && score != null ? (
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 46,
              fontWeight: ae.titleWeight,
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              color: ae.text,
              fontVariantNumeric: 'tabular-nums',
              textShadow: `0 0 28px rgba(${palette.glow}, 0.5)`,
            }}
          >
            <AnimatedNumber value={score} format={(n) => n.toFixed(2)} duration={1100} />
          </span>
        ) : (
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 38,
              fontWeight: ae.titleWeight,
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
              color: ae.textDim,
            }}
          >
            {emptyText}
          </span>
        )}
        <span style={{ fontFamily: ae.fontMono, fontSize: 10, letterSpacing: '0.12em', color: ae.textMute }}>
          / {scoreMax.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── HeroScoreCard — Fire Weather / Active Fire Threat ────────────────────────
export function HeroScoreCard({
  label,
  icon,
  score,
  bucket,
  zoneBoundaries,
  scoreMax = 1,
  caption,
  emptyText = '—',
  isLoading = false,
  howCalculatedHref,
  calibrationLabel,
  onCalibration,
}: {
  label: string;
  icon: IconName;
  score: number | null;
  bucket: RiskLevel | null;
  zoneBoundaries?: { low: number; moderate: number; extreme: number };
  scoreMax?: number;
  caption: string;
  emptyText?: string;
  isLoading?: boolean;
  /** When set, renders a "How it's calculated" button that navigates here. */
  howCalculatedHref?: string;
  /** When both are set, renders a "Calibrated for <state>" trigger that opens
   *  the calibration modal — placed here (next to the fire-weather score it
   *  describes) rather than by the composite headline, where it misleadingly
   *  read as explaining the composite tier. */
  calibrationLabel?: string;
  onCalibration?: () => void;
}) {
  const { ae, accent } = useAesthetic();
  // Chrome floors to moderate (amber base); the chip shows the true tier.
  const palette = paletteFor(chromeBucketOf(bucket), accent);
  const chipTone = bucket ? paletteFor(bucket, accent) : null;
  const hasScore = !isLoading && score != null;

  const z = zoneBoundaries ?? { low: 0.25, moderate: 0.5, extreme: 0.75 };
  const zones: Zone[] = [
    { to: z.low / scoreMax, color: RISK_LEVELS.low.color, lbl: 'Low' },
    { to: z.moderate / scoreMax, color: RISK_LEVELS.moderate.color, lbl: 'Mod' },
    { to: z.extreme / scoreMax, color: getRisk('high', accent).color, lbl: 'High' },
    { to: 1, color: getRisk('extreme', accent).color, lbl: 'Ext' },
  ];
  const frac = score == null ? 0 : Math.min(1, Math.max(0, score / scoreMax));
  const markerPct = Math.max(1.5, Math.min(98.5, frac * 100));

  return (
    <TiltCard
      max={3}
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 332,
        background: `linear-gradient(160deg, ${ae.surface2}, ${ae.surface} 60%, #07090d)`,
        border: `0.5px solid rgba(${palette.glow}, 0.28)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 40px 90px rgba(${palette.glow}, 0.12), 0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <HsAtmosphere glow={palette.glow} />
      <HsBeam color={palette.color} />
      <HsHudCorners color={palette.color} />

      <div style={{ position: 'relative', zIndex: 2, padding: 26, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background: `radial-gradient(circle at 30% 30%, rgba(${palette.glow}, 0.30), rgba(${palette.glow}, 0.06))`,
                border: `0.5px solid rgba(${palette.glow}, 0.40)`,
                boxShadow: `0 4px 14px rgba(${palette.glow}, 0.25), inset 0 1px 0 rgba(255,255,255,0.12)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={icon} size={17} color={palette.color} strokeWidth={1.7} />
            </div>
            <Eyebrow color={palette.color}>{label}</Eyebrow>
          </div>
          {isLoading ? (
            <Skeleton width={84} height={24} rounded="full" />
          ) : chipTone ? (
            <HsToneChip ae={ae} color={chipTone.color} glow={chipTone.glow} label={chipTone.label} />
          ) : null}
        </div>

        {/* body: gauge + readout */}
        <div className="app-stack" style={{ flex: 1, marginTop: 10, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 22, alignItems: 'center' }}>
          <HsRiskGauge
            ae={ae}
            frac={frac}
            zones={zones}
            palette={palette}
            score={score}
            scoreMax={scoreMax}
            hasScore={hasScore}
            loading={isLoading}
            emptyText={emptyText}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* zone meter */}
            <div>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 3, height: 9, borderRadius: 99 }}>
                  {zones.map((zone, i) => {
                    const p = i === 0 ? 0 : zones[i - 1].to;
                    const w = (zone.to - p) * 100;
                    const active = hasScore && frac >= p;
                    const rgb = hexToRgb(zone.color);
                    return (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        style={{
                          width: `${w}%`,
                          borderRadius: 99,
                          background: active
                            ? `linear-gradient(180deg, rgba(${rgb}, 0.65), rgba(${rgb}, 0.25))`
                            : `rgba(${rgb}, 0.12)`,
                          border: `0.5px solid rgba(${rgb}, ${active ? 0.5 : 0.16})`,
                          boxShadow: active ? `0 0 10px rgba(${rgb}, 0.35)` : 'none',
                          transition: 'background .5s ease',
                        }}
                      />
                    );
                  })}
                </div>
                {hasScore ? (
                  <div style={{ position: 'absolute', top: -4, left: `${markerPct}%`, transform: 'translateX(-50%)' }}>
                    <div style={{ width: 2, height: 17, borderRadius: 99, background: '#fff', boxShadow: `0 0 10px ${palette.color}` }} />
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: 9,
                  display: 'flex',
                  gap: 3,
                  fontFamily: ae.fontMono,
                  fontSize: 9.5,
                  letterSpacing: '0.14em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                {zones.map((zone, i) => {
                  const p = i === 0 ? 0 : zones[i - 1].to;
                  const w = (zone.to - p) * 100;
                  const activeLbl = chipTone != null && chipTone.color === zone.color;
                  return (
                    <span
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      style={{ width: `${w}%`, textAlign: 'center', color: activeLbl ? chipTone.color : ae.textMute, fontWeight: activeLbl ? 700 : 500 }}
                    >
                      {zone.lbl}
                    </span>
                  );
                })}
              </div>
            </div>

            <p style={{ margin: 0, paddingTop: 14, borderTop: `0.5px solid ${ae.line}`, fontFamily: ae.fontBody, fontSize: 12.5, lineHeight: 1.5, color: ae.textDim }}>
              {caption}
            </p>

            {calibrationLabel && onCalibration ? (
              <button
                type="button"
                onClick={onCalibration}
                aria-label="What does calibrated for this state mean?"
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: -6,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  color: ae.textMute,
                  cursor: 'pointer',
                  fontFamily: ae.fontMono,
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  textAlign: 'left',
                }}
              >
                {calibrationLabel}
                <Icon name="info" size={9} color={ae.textMute} strokeWidth={1.8} />
              </button>
            ) : null}

            {howCalculatedHref ? (
              <button
                type="button"
                onClick={() => { window.location.href = howCalculatedHref; }}
                aria-label="How the fire-weather score is calculated"
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: -6,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  color: ae.textMute,
                  cursor: 'pointer',
                  fontFamily: ae.fontMono,
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                How it&apos;s calculated
                <Icon name="chevron" size={9} color={ae.textMute} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </TiltCard>
  );
}

// ── HsAICore — orbiting neural rings + glowing nucleus ───────────────────────
function HsAICore({
  ae,
  value,
  suffix,
  tone,
  highlight,
  band,
  bandTone,
  loading,
}: {
  ae: Ae;
  value: number;
  suffix: string;
  tone: RiskTone;
  highlight: string;
  band: string;
  bandTone: RiskTone;
  loading: boolean;
}) {
  const size = 300;
  const c = size / 2;
  // Revolution period (s) per orbit — slow enough to be graceful, fast enough to
  // still read as circling.
  const orbits = [
    { r: 124, n: 7, speed: 28, dir: 1, dot: 2.4 },
    { r: 92, n: 5, speed: 21, dir: -1, dot: 2.0 },
    { r: 62, n: 4, speed: 14, dir: 1, dot: 1.7 },
  ];
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto', maxWidth: '100%' }}>
      <div
        className="hs-halo"
        style={{
          position: 'absolute',
          inset: '14%',
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${tone.glow}, 0.30), transparent 68%)`,
          filter: 'blur(18px)',
          animation: 'hs-halopulse 5s ease-in-out infinite',
        }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        {orbits.map((o, i) => (
          <circle
            // eslint-disable-next-line react/no-array-index-key
            key={`r${i}`}
            cx={c}
            cy={c}
            r={o.r}
            fill="none"
            stroke={`rgba(${tone.glow}, ${0.16 - i * 0.02})`}
            strokeWidth="0.6"
            strokeDasharray={i === 0 ? '1 6' : i === 1 ? '2 5' : 'none'}
          />
        ))}
        {orbits.map((o, i) => (
          <g
            // eslint-disable-next-line react/no-array-index-key
            key={`o${i}`}
            className={o.dir > 0 ? 'hs-spin' : 'hs-spin-rev'}
            style={{ transformOrigin: `${c}px ${c}px`, transformBox: 'view-box', animation: `${o.dir > 0 ? 'hs-rot' : 'hs-rotrev'} ${o.speed}s linear infinite` }}
          >
            {Array.from({ length: o.n }).map((_, k) => {
              const a = (k / o.n) * Math.PI * 2;
              const x = c + Math.cos(a) * o.r;
              const y = c + Math.sin(a) * o.r;
              return (
                <g key={k}>
                  <line x1={c} y1={c} x2={x} y2={y} stroke={`rgba(${tone.glow}, 0.12)`} strokeWidth="0.5" strokeDasharray="2 4" style={{ animation: `hs-dataflow ${3 + k * 0.4}s linear infinite` }} />
                  <circle className="hs-twinkle" cx={x} cy={y} r={o.dot} fill={highlight} style={{ filter: `drop-shadow(0 0 5px ${tone.color})`, animation: `hs-twinkle ${2.4 + k * 0.5}s ease-in-out infinite` }} />
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      {/* nucleus */}
      <div
        className="hs-core-pulse"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 116,
          height: 116,
          marginLeft: -58,
          marginTop: -58,
          borderRadius: '50%',
          backgroundImage: `radial-gradient(circle at 36% 32%, ${highlight}, ${tone.color} 48%, rgba(${tone.glow},0.35) 100%)`,
          border: `0.5px solid rgba(${tone.glow}, 0.6)`,
          boxShadow: `0 0 44px rgba(${tone.glow}, 0.55), inset 0 2px 10px rgba(255,255,255,0.30), inset 0 -10px 22px rgba(0,0,0,0.35)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'hs-corepulse 5s ease-in-out infinite',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 10, left: 22, width: 34, height: 16, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.6), transparent 70%)', filter: 'blur(1px)' }} />
        {loading ? (
          <span style={{ fontFamily: ae.fontMono, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(26,18,6,0.75)', textTransform: 'uppercase' }}>···</span>
        ) : (
          <>
            <span
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 40,
                fontWeight: ae.titleWeight,
                lineHeight: 0.9,
                letterSpacing: '-0.04em',
                color: '#1a1206',
                fontVariantNumeric: 'tabular-nums',
                textShadow: '0 1px 0 rgba(255,255,255,0.35)',
              }}
            >
              <AnimatedNumber value={value} format={(n) => Math.round(n).toString()} duration={1300} />
              {suffix}
            </span>
            <span style={{ fontFamily: ae.fontMono, fontSize: 8.5, letterSpacing: '0.26em', color: 'rgba(26,18,6,0.7)', textTransform: 'uppercase', marginTop: 1 }}>
              percentile
            </span>
          </>
        )}
      </div>

      {/* band chip under nucleus */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: 64, display: 'flex', justifyContent: 'center' }}>
        {loading ? <Skeleton width={92} height={26} rounded="full" /> : <HsToneChip ae={ae} color={bandTone.color} glow={bandTone.glow} label={band} dot={false} />}
      </div>
    </div>
  );
}

// ── HsDistribution — predictive density curve with TODAY marker ──────────────
function HsDistribution({ ae, pct, tone, highlight }: { ae: Ae; pct: number; tone: RiskTone; highlight: string }) {
  const W = 560;
  const H = 188;
  const base = 150;
  const padX = 14;
  const ampl = 116;
  const x0 = padX;
  const x1 = W - padX;
  const f = (x: number) => Math.exp(-Math.pow(x - 0.46, 2) / (2 * 0.034));
  const { linePath, areaPath, cumPath, mx, my, ticks } = useMemo(() => {
    const N = 64;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push([x0 + t * (x1 - x0), base - f(t) * ampl]);
    }
    const line = 'M ' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
    const area = line + ` L ${x1} ${base} L ${x0} ${base} Z`;
    const cum = pts.filter((_, i) => i / N <= pct);
    const mxv = x0 + pct * (x1 - x0);
    const myv = base - f(pct) * ampl;
    const cumPathStr =
      'M ' + cum.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ` L ${mxv.toFixed(1)} ${myv.toFixed(1)} L ${mxv.toFixed(1)} ${base} L ${x0} ${base} Z`;
    const tk = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ x: x0 + t * (x1 - x0), t }));
    return { linePath: line, areaPath: area, cumPath: cumPathStr, mx: mxv, my: myv, ticks: tk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id="hs-dist-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${tone.glow}, 0.10)`} />
          <stop offset="100%" stopColor={`rgba(${tone.glow}, 0)`} />
        </linearGradient>
        <linearGradient id="hs-dist-cum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${tone.glow}, 0.42)`} />
          <stop offset="100%" stopColor={`rgba(${tone.glow}, 0.04)`} />
        </linearGradient>
      </defs>
      {ticks.map((tk, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <g key={i}>
          <line x1={tk.x} y1={20} x2={tk.x} y2={base} stroke={ae.line} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.6" />
          <text x={tk.x} y={base + 16} textAnchor="middle" fontFamily={ae.fontMono} fontSize="8.5" fill={ae.textMute} letterSpacing="0.08em">
            {Math.round(tk.t * 100)}
          </text>
        </g>
      ))}
      <line x1={x0} y1={base} x2={x1} y2={base} stroke={ae.lineStrong} strokeWidth="0.5" />
      <path d={areaPath} fill="url(#hs-dist-area)" />
      <path d={cumPath} fill="url(#hs-dist-cum)" />
      <path
        d={linePath}
        fill="none"
        stroke={tone.color}
        strokeWidth="2"
        pathLength={1}
        strokeDasharray="1 1"
        style={{ filter: `drop-shadow(0 0 6px ${tone.color})`, animation: 'hs-draw1 1.8s cubic-bezier(0.3,0.9,0.3,1) both' }}
      />
      <line x1={mx} y1={my} x2={mx} y2={base} stroke={highlight} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.85" />
      <circle className="hs-marker-ring" cx={mx} cy={my} r="9" fill="none" stroke={highlight} strokeWidth="1" style={{ transformOrigin: `${mx}px ${my}px`, animation: 'hs-markerpulse 2.6s ease-out infinite' }} />
      <circle cx={mx} cy={my} r="4.5" fill={highlight} style={{ filter: `drop-shadow(0 0 8px ${tone.color})` }} />
      <circle cx={mx} cy={my} r="1.8" fill="#fff" />
      <g transform={`translate(${Math.min(mx, x1 - 60)}, 8)`}>
        <rect x="-2" y="0" width="62" height="17" rx="5" fill={`rgba(${tone.glow}, 0.16)`} stroke={`rgba(${tone.glow}, 0.4)`} strokeWidth="0.5" />
        <text x="29" y="12" textAnchor="middle" fontFamily={ae.fontMono} fontSize="9" fontWeight="700" fill={highlight} letterSpacing="0.12em">
          TODAY
        </text>
      </g>
    </svg>
  );
}

// ── IgnitionCoreCard — the ML intelligence core ──────────────────────────────
export function IgnitionCoreCard({
  data,
  isLoading = false,
  isError = false,
  onRetry,
}: {
  data: IgnitionResponse | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const { ae } = useAesthetic();
  const [infoOpen, setInfoOpen] = useState(false);

  // Failed / unavailable — neutral-slate error (never a tinted risk verdict),
  // matching the rest of the app + the prior IgnitionCard behavior.
  if (isError || data === null) {
    return (
      <DataErrorState
        title="Ignition estimate unavailable"
        message="The model couldn't score this location right now — recent weather data may be temporarily unavailable."
        onRetry={onRetry}
      />
    );
  }

  const loading = isLoading || data === undefined;
  const level: RiskLevel = data ? data.level : 'moderate';
  const chromeLevel = chromeBucketOf(level); // floor low → moderate for the chrome
  const tone = RISK_LEVELS[chromeLevel]; // card + core (amber base)
  const trueTone = RISK_LEVELS[level]; // true tier → band chip + assessment
  const highlight = CORE_HIGHLIGHT[chromeLevel];
  const pctNum = data ? data.percentile : 0;
  const band = LEVEL_LABEL[level];

  return (
    <TiltCard
      max={1.5}
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 440,
        background: `linear-gradient(155deg, #19130b, ${ae.surface} 55%, #07090d)`,
        border: `0.5px solid rgba(${tone.glow}, 0.30)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 50px 110px rgba(${tone.glow}, 0.14), 0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <HsAtmosphere glow={tone.glow} />
      <HsBeam color={tone.color} />
      <HsHudCorners color={tone.color} />

      <div className="app-card-pad" style={{ position: 'relative', zIndex: 2, padding: '28px 30px 24px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 13,
                flexShrink: 0,
                position: 'relative',
                background: `radial-gradient(circle at 32% 30%, rgba(${tone.glow}, 0.34), rgba(${tone.glow}, 0.06))`,
                border: `0.5px solid rgba(${tone.glow}, 0.42)`,
                boxShadow: `0 6px 18px rgba(${tone.glow}, 0.22), inset 0 1px 0 rgba(255,255,255,0.14)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                <circle cx="13" cy="13" r="3" fill={tone.color} style={{ filter: `drop-shadow(0 0 5px ${tone.color})` }} />
                {[0, 1, 2].map((i) => (
                  <circle key={i} cx="13" cy="13" r={5 + i * 3.4} fill="none" stroke={tone.color} strokeWidth="0.8" opacity={0.5 - i * 0.13} strokeDasharray={i === 1 ? '2 3' : 'none'} />
                ))}
                {[30, 150, 270].map((d, i) => {
                  const a = (d * Math.PI) / 180;
                  return <circle key={i} cx={13 + Math.cos(a) * 11.4} cy={13 + Math.sin(a) * 11.4} r="1.3" fill={tone.color} />;
                })}
              </svg>
            </div>
            <div>
              <Eyebrow color={tone.color}>Ignition Likelihood</Eyebrow>
              <div style={{ marginTop: 5, fontFamily: ae.fontMono, fontSize: 11, letterSpacing: '0.06em', color: ae.textDim }}>Predictive intelligence engine</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 99,
                background: 'rgba(0,0,0,0.4)',
                border: `0.5px solid rgba(${tone.glow}, 0.34)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: tone.color,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: tone.color, boxShadow: `0 0 8px ${tone.color}`, animation: 'hs-twinkle 1.8s ease-in-out infinite' }} />
              {loading ? 'ML Model · Computing' : 'ML Model'}
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="About the ignition model"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                flexShrink: 0,
                background: 'rgba(0,0,0,0.4)',
                border: `0.5px solid rgba(${tone.glow}, 0.34)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: tone.color,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="info" size={15} color={tone.color} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* main: core + distribution */}
        <div className="app-stack" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 30, alignItems: 'center' }}>
          <HsAICore ae={ae} value={pctNum} suffix={ordinalSuffix(pctNum)} tone={tone} highlight={highlight} band={band} bandTone={trueTone} loading={loading} />

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
              <span style={{ fontFamily: ae.fontMono, fontSize: 10, letterSpacing: '0.16em', color: ae.textDim, textTransform: 'uppercase' }}>
                Today vs historical fire-onset days
              </span>
            </div>
            {loading ? (
              // Match the distribution graph's footprint (560×188) so there's no
              // layout shift when the real curve replaces it.
              <div style={{ width: '100%', aspectRatio: '560 / 188' }}>
                <Skeleton width="100%" height={188} rounded="md" style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            ) : (
              <HsDistribution ae={ae} pct={Math.min(1, Math.max(0, pctNum / 100))} tone={tone} highlight={highlight} />
            )}
            <p style={{ margin: '12px 0 0', fontFamily: ae.fontBody, fontSize: 13, lineHeight: 1.5, color: ae.textDim, maxWidth: 560 }}>
              How closely today&apos;s conditions resemble the days fires have actually started — a relative likelihood, not an absolute chance.
            </p>
          </div>
        </div>

      </div>

      <IgnitionInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </TiltCard>
  );
}

// ── HsSystemField — one shared atmosphere flowing behind all three modules ───
function HsSystemField({ tone, leftTone, rightTone }: { tone: RiskTone; leftTone: RiskTone; rightTone: RiskTone }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(55% 46% at 20% 8%, rgba(${leftTone.glow}, 0.15), transparent 62%), radial-gradient(55% 46% at 80% 8%, rgba(${rightTone.glow}, 0.15), transparent 62%), radial-gradient(60% 52% at 50% 100%, rgba(${tone.glow}, 0.16), transparent 62%), radial-gradient(52% 42% at 50% 50%, rgba(${tone.glow}, 0.08), transparent 66%), linear-gradient(180deg, rgba(10,8,6,0), rgba(7,9,13,0.30))`,
        }}
      />
      <div style={{ position: 'absolute', bottom: '-22%', left: '28%', width: '48%', height: '74%', borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, rgba(${tone.glow}, 0.16), transparent 70%)`, animation: 'hs-sysblob 18s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '-26%', left: '0%', width: '36%', height: '72%', borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, rgba(${leftTone.glow}, 0.14), transparent 70%)`, animation: 'hs-sysblob 22s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', top: '-26%', right: '0%', width: '36%', height: '72%', borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, rgba(${rightTone.glow}, 0.14), transparent 70%)`, animation: 'hs-sysblob 20s ease-in-out infinite' }} />
      <GridPattern opacity={0.03} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(125% 120% at 50% 45%, transparent 58%, rgba(0,0,0,0.45) 100%)' }} />
    </div>
  );
}

// ── IntelligenceSystem — the three modules unified into one cinematic stage ──
export function IntelligenceSystem({
  ae,
  fireWeather,
  threat,
  ignition,
}: {
  ae: Ae;
  fireWeather: {
    score: number | null;
    bucket: RiskLevel | null;
    zoneBoundaries?: { low: number; moderate: number; extreme: number };
    scoreMax: number;
    caption: string;
    emptyText?: string;
    isLoading: boolean;
    howCalculatedHref?: string;
    calibrationLabel?: string;
    onCalibration?: () => void;
  };
  threat: {
    score: number | null;
    bucket: RiskLevel | null;
    zoneBoundaries?: { low: number; moderate: number; extreme: number };
    scoreMax: number;
    caption: string;
    emptyText?: string;
    isLoading: boolean;
  };
  ignition: { data: IgnitionResponse | null | undefined; isLoading: boolean; isError: boolean; onRetry?: () => void };
}) {
  const { accent } = useAesthetic();
  // Shared-field tones floor to moderate too, so low / none read as the moderate
  // (amber) base rather than green / grey.
  const fwPal = paletteFor(chromeBucketOf(fireWeather.bucket), accent);
  const thPal = paletteFor(chromeBucketOf(threat.bucket), accent);
  const coreTone = RISK_LEVELS[chromeBucketOf(ignition.data ? ignition.data.level : null)];

  return (
    <div className="app-intel-pad" style={{ position: 'relative', borderRadius: ae.radiusLg + 12, padding: 22 }}>
      <HsSystemField tone={coreTone} leftTone={fwPal} rightTone={thPal} />
      <HsHudCorners color={`rgba(${coreTone.glow}, 0.7)`} inset={10} len={24} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div className="app-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 22 }}>
          <HeroScoreCard
            label="Fire Weather"
            icon="flame"
            score={fireWeather.score}
            bucket={fireWeather.bucket}
            zoneBoundaries={fireWeather.zoneBoundaries}
            scoreMax={fireWeather.scoreMax}
            caption={fireWeather.caption}
            emptyText={fireWeather.emptyText}
            isLoading={fireWeather.isLoading}
            howCalculatedHref={fireWeather.howCalculatedHref}
            calibrationLabel={fireWeather.calibrationLabel}
            onCalibration={fireWeather.onCalibration}
          />
          <HeroScoreCard
            label="Active Fire Threat"
            icon="pin"
            score={threat.score}
            bucket={threat.bucket}
            zoneBoundaries={threat.zoneBoundaries}
            scoreMax={threat.scoreMax}
            caption={threat.caption}
            emptyText={threat.emptyText}
            isLoading={threat.isLoading}
          />
        </div>

        <div style={{ height: 24 }} />

        <IgnitionCoreCard data={ignition.data} isLoading={ignition.isLoading} isError={ignition.isError} onRetry={ignition.onRetry} />
      </div>

      {/* unifying light sweep across all three modules */}
      <div aria-hidden className="hs-sweep" style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit' }}>
        <div style={{ position: 'absolute', top: '-10%', bottom: '-10%', width: '46%', left: 0, mixBlendMode: 'screen', background: `linear-gradient(90deg, transparent, rgba(${coreTone.glow}, 0.07), transparent)`, animation: 'hs-sweep 12s ease-in-out infinite 2s' }} />
      </div>
    </div>
  );
}

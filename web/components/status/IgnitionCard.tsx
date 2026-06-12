'use client';

// Status page card: the machine-learning ignition-likelihood signal. Sits
// beneath the Score Breakdown + Threat Source cards as a third, independent
// lens — "do today's conditions look like a day fires actually start here?".
//
// Distinct from the V4 fire-weather score: that asks "how bad could a fire
// get?" (tied to fire SIZE); this asks "how likely is a fire to START?" (tied
// to fire OCCURRENCE), via a gradient-boosted model trained on historical
// fires. Output is a calibrated percentile index, not an absolute chance.
//
// States: loading skeleton · unavailable (model/upstream null) · live.
// Premium chrome mirrors ThreatSourceCard (TiltCard + accent stripe + glow).

import { Icon } from '@/components/Icon';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import type { IgnitionResponse } from '@/lib/api';
import { RISK_LEVELS, type RiskLevel } from '@/lib/theme';

type Ae = ReturnType<typeof useAesthetic>['ae'];

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  extreme: 'EXTREME',
};

// Trained-on count + headline skill — surfaced as stats so the card reads as a
// real, evaluated model. Keep in sync with ML.md / the model card.
const TRAINED_ON = '4,897 fires';
const MODEL_SKILL = '0.83 AUC';

function ordinal(n: number): string {
  const i = Math.round(n);
  const v = i % 100;
  const suffix = ['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th';
  return `${i}${suffix}`;
}

function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function IgnitionCard({
  data,
  isLoading,
  isError = false,
  onRetry,
}: {
  data: IgnitionResponse | null | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const { ae } = useAesthetic();

  // ── Failed / unavailable FIRST. Uses the shared neutral-slate DataErrorState
  //    (NOT a tinted card) so a failure never implies a fire-risk verdict — the
  //    same rule the rest of the app follows. Covers a fetch error and a null
  //    payload (the model couldn't score the location). ─
  if (isError || data === null) {
    return (
      <DataErrorState
        title="Ignition estimate unavailable"
        message="The model couldn't score this location right now — recent weather data may be temporarily unavailable."
        onRetry={onRetry}
      />
    );
  }

  // ── Loading (fetching, or no location resolved yet → data undefined). ─
  if (isLoading || data === undefined) {
    return (
      <CardShell ae={ae} glow={RISK_LEVELS.moderate.glow}>
        <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Skeleton width={56} height={56} rounded="lg" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width={130} height={12} rounded="sm" />
              <Skeleton width={210} height={30} rounded="md" />
              <Skeleton width={180} height={11} rounded="sm" />
            </div>
          </div>
          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} width="100%" height={72} rounded="md" />
            ))}
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Live ──────────────────────────────────────────────────────────────────
  const tone = RISK_LEVELS[data.level];
  const glow = tone.glow;
  const color = tone.color;

  return (
    <CardShell ae={ae} glow={glow}>
      <div
        aria-hidden
        style={{ height: 3, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 14px ${color}` }}
      />
      <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
            <IconStone glow={glow} color={color} />
            <div style={{ minWidth: 0 }}>
              <Eyebrow color={color}>Ignition Likelihood</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                <span
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 34,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: ae.text,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {ordinal(data.percentile)}
                </span>
                <span style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim }}>percentile</span>
                <LevelPill color={color} glow={glow} label={LEVEL_LABEL[data.level]} />
              </div>
              <p style={{ ...captionStyle(ae), marginTop: 6, maxWidth: 560 }}>
                How closely today&apos;s conditions resemble the days fires have actually started — a relative likelihood, not an absolute chance.
              </p>
            </div>
          </div>

          {/* ML badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 99,
              background: 'rgba(0,0,0,0.40)',
              border: `0.5px solid rgba(${glow}, 0.32)`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color,
              textTransform: 'uppercase',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <Icon name="flame" size={11} color={color} strokeWidth={2} />
            ML Model
          </div>
        </div>

        {/* 4-stat grid */}
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <Stat ae={ae} label="Assessment" value={LEVEL_LABEL[data.level]} accent={color} />
          <Stat ae={ae} label="Model skill" value={MODEL_SKILL} />
          <Stat ae={ae} label="Trained on" value={TRAINED_ON} />
          <Stat ae={ae} label="Conditions" value={formatAsOf(data.as_of)} />
        </div>
      </div>
    </CardShell>
  );
}

// ─── Internal pieces ──────────────────────────────────────────────────────

function IconStone({ glow, color }: { glow: string; color: string }) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        flexShrink: 0,
        position: 'relative',
        background: `radial-gradient(circle at 30% 30%, rgba(${glow}, 0.32), rgba(${glow}, 0.08))`,
        border: `0.5px solid rgba(${glow}, 0.40)`,
        boxShadow: `0 6px 20px rgba(${glow}, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Ignition-spark glyph */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="14" cy="14" r="3" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const r = (deg * Math.PI) / 180;
          const x1 = 14 + Math.cos(r) * 6;
          const y1 = 14 + Math.sin(r) * 6;
          const x2 = 14 + Math.cos(r) * 10;
          const y2 = 14 + Math.sin(r) * 10;
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity={deg % 90 === 0 ? 0.85 : 0.45} />
          );
        })}
      </svg>
    </div>
  );
}

function LevelPill({ color, glow, label }: { color: string; glow: string; label: string }) {
  const { ae } = useAesthetic();
  return (
    <span
      style={{
        padding: '3px 10px',
        borderRadius: 99,
        background: `rgba(${glow}, 0.16)`,
        border: `0.5px solid rgba(${glow}, 0.42)`,
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.16em',
        color,
      }}
    >
      {label}
    </span>
  );
}

function Stat({ ae, label, value, accent }: { ae: Ae; label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.022)',
        border: '0.5px solid rgba(255,255,255,0.06)',
        borderRadius: ae.radius,
        padding: '14px 14px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        minWidth: 0,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 10,
          fontFamily: ae.fontDisplay,
          fontSize: 20,
          fontWeight: ae.titleWeight,
          letterSpacing: '-0.02em',
          color: accent ?? ae.text,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CardShell({ ae, glow, children }: { ae: Ae; glow: string; children: React.ReactNode }) {
  return (
    <TiltCard
      max={2}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${glow}, 0.22)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 30px 80px rgba(${glow}, 0.10), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 360,
          height: 360,
          borderRadius: '50%',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${glow}, 0.14), transparent 70%)`,
        }}
      />
      <GridPattern opacity={0.04} />
      {children}
    </TiltCard>
  );
}

function captionStyle(ae: Ae): React.CSSProperties {
  return { margin: '6px 0 0', fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, lineHeight: 1.5 };
}

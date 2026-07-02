'use client';

// "Score Breakdown" — opens from a small text trigger on the Status hero.
// Walks the user through their headline tier as a TWO-STAGE story, both stages
// being published lookup matrices (no hidden weights):
//
//   Stage 1 — Environmental danger:  Fire Weather (W) ⊗ Ignition Likelihood (I)
//             via ENV_MATRIX (hazard = likelihood × consequence) → E
//   Stage 2 — Your headline:         Environment (E) × Active-fire Threat (T)
//             via COMPOSITE_MATRIX → headline tier
//
// Pure presentational. All inputs flow from StatusScreen so the modal reflects
// exactly what the user sees on the page.

import {
  CompositeMatrixGrid,
  EnvMatrixGrid,
} from '@/components/status/CompositeMatrixGrid';
import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds } from '@/lib/api';
import type { ThreatDriver } from '@/lib/composite-risk';
import { hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { formatDistance, type DistanceUnit } from '@/lib/use-units';

const ACRES_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const TIER_LONG: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  extreme: 'EXTREME',
};

const TIER_PHRASE: Record<RiskLevel, string> = {
  low: 'a low-risk day for your area',
  moderate: 'a moderate-risk day for your area',
  high: 'a high-risk day. Review your plan',
  extreme: 'an extreme-risk day. Be ready to act',
};

function ordinal(n: number): string {
  const i = Math.round(n);
  const v = i % 100;
  return `${i}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}`;
}

export function CompositeExplainerModal({
  open,
  onClose,
  weatherBucket,
  ignitionBucket,
  ignitionPercentile,
  envBucket,
  threatBucket,
  compositeBucket,
  weatherRawScore,
  threatSignal,
  regionalState,
  regionalThresholds,
  driver,
  distanceUnit,
}: {
  open: boolean;
  onClose: () => void;
  /** Fire-weather severity tier from the calibrated bucketing. */
  weatherBucket: RiskLevel | null;
  /** ML ignition-likelihood tier; null while loading or unavailable. */
  ignitionBucket: RiskLevel | null;
  /** Ignition percentile (0-100) for display; null when unavailable. */
  ignitionPercentile: number | null;
  /** Stage-1 environmental tier E = ENV_MATRIX[W][I]. */
  envBucket: RiskLevel | null;
  /** Threat tier; null when no fire is within THREAT_RADIUS_MI=50. */
  threatBucket: RiskLevel | null;
  /** Headline tier — already computed upstream. */
  compositeBucket: RiskLevel | null;
  /** Raw V4 fire-weather score for display. */
  weatherRawScore: number | null;
  /** Aggregate threat score (0-1). */
  threatSignal: number | null;
  regionalState: string | null;
  regionalThresholds: RegionalThresholds | null;
  driver: ThreatDriver | null;
  distanceUnit: DistanceUnit;
}) {
  const { ae } = useAesthetic();

  return (
    <Modal open={open} onClose={onClose} eyebrow="Methodology" title="Score Breakdown" maxWidth={660}>
      <p style={textBody(ae)}>
        Your overall level is built from <strong style={{ color: ae.text }}>three things</strong>,
        combined in <strong style={{ color: ae.text }}>two steps</strong>. First, the{' '}
        <strong style={{ color: ae.text }}>fire weather</strong>{' '}around you is mixed with how likely a{' '}
        <strong style={{ color: ae.text }}>fire is to start</strong>{' '}today. Then that is weighed
        against any <strong style={{ color: ae.text }}>active fire</strong>{' '}burning near you.
      </p>

      {/* Three input cards */}
      <div className="app-stack" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <ComponentCard
          ae={ae}
          label="Fire weather"
          tier={weatherBucket}
          rawScore={weatherRawScore}
          contextLine={
            regionalState && regionalThresholds
              ? `Graded against ${regionalState}'s fire history`
              : 'Graded on a nationwide scale'
          }
        />
        <ComponentCard
          ae={ae}
          label="Ignition likelihood"
          tier={ignitionBucket}
          rawScoreText={ignitionPercentile != null ? ordinal(ignitionPercentile) : null}
          contextLine={
            ignitionBucket
              ? 'How much today resembles past days when fires started'
              : 'Not available right now, using fire weather alone'
          }
        />
        <ComponentCard
          ae={ae}
          label="Active fire threat"
          tier={threatBucket}
          rawScore={threatSignal}
          contextLine={
            driver
              ? driver.kind === 'incident'
                ? `${driver.incident.name}, ${formatDistance(driver.incident.distance_mi, distanceUnit, 1)} away${
                    driver.incident.acres != null ? `, ${ACRES_FORMAT.format(driver.incident.acres)} ac` : ''
                  }`
                : `Satellite detection ${formatDistance(driver.distanceMi, distanceUnit, 1)} away`
              : `No active fires within ${formatDistance(50, distanceUnit, 0)} of your location`
          }
        />
      </div>

      {/* Stage 1 — environment */}
      <Section ae={ae} title="Step 1: The environment around you">
        <p style={{ ...textBody(ae), marginBottom: 6 }}>
          This step combines the fire weather with how likely a fire is to start today. If either one
          is low, your environment stays at moderate or below. It takes both being elevated to push
          it higher.
        </p>
        <EnvMatrixGrid weatherBucket={weatherBucket} ignitionBucket={ignitionBucket} />
        <AxisLabels ae={ae} left="FIRE WEATHER" right="IGNITION LIKELIHOOD" />
        {envBucket ? (
          <p style={{ ...textBody(ae), marginTop: 8 }}>
            → Your environment:{' '}
            <strong style={{ color: RISK_LEVELS[envBucket].color }}>{TIER_LONG[envBucket]}</strong>
          </p>
        ) : null}
      </Section>

      {/* Stage 2 — headline */}
      <Section ae={ae} title="Step 2: Your overall level">
        <p style={{ ...textBody(ae), marginBottom: 6 }}>
          Now your environment is weighed against the most serious active fire near you. Your result
          is highlighted in the grid below.
        </p>
        <CompositeMatrixGrid weatherBucket={envBucket} threatBucket={threatBucket} />
        <AxisLabels ae={ae} left="ENVIRONMENT" right="ACTIVE FIRE THREAT" />
      </Section>

      {compositeBucket ? (
        <OutcomeCallout ae={ae} envBucket={envBucket} threatBucket={threatBucket} compositeBucket={compositeBucket} />
      ) : null}
    </Modal>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ComponentCard({
  ae,
  label,
  tier,
  rawScore,
  rawScoreText,
  contextLine,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  tier: RiskLevel | null;
  rawScore?: number | null;
  rawScoreText?: string | null;
  contextLine: string;
}) {
  const tone = tier ? RISK_LEVELS[tier] : null;
  const rgb = tone ? hexToRgb(tone.color) : '255,255,255';
  const big = rawScoreText ?? (rawScore != null ? rawScore.toFixed(2) : '—');
  return (
    <div
      style={{
        padding: 13,
        borderRadius: 10,
        background: tone
          ? `linear-gradient(180deg, rgba(${rgb}, 0.10), rgba(${rgb}, 0.03))`
          : 'rgba(255,255,255,0.04)',
        border: tone ? `0.5px solid rgba(${rgb}, 0.28)` : `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.16em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: tone?.color ?? ae.textDim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {big}
        </span>
        <span style={{ fontFamily: ae.fontMono, fontSize: 10, fontWeight: 700, color: tone?.color ?? ae.textMute, letterSpacing: '0.12em' }}>
          {tier ? TIER_LONG[tier] : 'NONE'}
        </span>
      </div>
      <div style={{ marginTop: 6, fontFamily: ae.fontBody, fontSize: 11.5, color: ae.textDim, lineHeight: 1.45 }}>
        {contextLine}
      </div>
    </div>
  );
}

function AxisLabels({ ae, left, right }: { ae: ReturnType<typeof useAesthetic>['ae']; left: string; right: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: ae.fontMono,
        fontSize: 9.5,
        color: ae.textMute,
        letterSpacing: '0.16em',
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function OutcomeCallout({
  ae,
  envBucket,
  threatBucket,
  compositeBucket,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  envBucket: RiskLevel | null;
  threatBucket: RiskLevel | null;
  compositeBucket: RiskLevel;
}) {
  const tone = RISK_LEVELS[compositeBucket];
  const rgb = hexToRgb(tone.color);
  const eLabel = envBucket ? TIER_LONG[envBucket] : 'PENDING';
  const tLabel = threatBucket ? TIER_LONG[threatBucket] : 'NONE';
  const threatPhrase = threatBucket ? `a ${tLabel} nearby fire` : 'no active fire nearby';
  return (
    <div
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: 12,
        background: `linear-gradient(180deg, rgba(${rgb}, 0.16), rgba(${rgb}, 0.06))`,
        border: `0.5px solid rgba(${rgb}, 0.45)`,
        boxShadow: `0 0 20px rgba(${rgb}, 0.18)`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ width: 6, height: 56, borderRadius: 6, background: tone.color, boxShadow: `0 0 12px ${tone.color}`, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: ae.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: ae.textMute, textTransform: 'uppercase' }}>
          Your level
        </div>
        <div style={{ marginTop: 4, fontFamily: ae.fontDisplay, fontSize: 16, fontWeight: 800, color: ae.text, letterSpacing: '-0.01em' }}>
          A {eLabel} environment with {threatPhrase}{' '}
          <span style={{ color: ae.textMute, fontWeight: 600 }}>→</span>{' '}
          <span style={{ color: tone.color }}>{TIER_LONG[compositeBucket]}</span>
        </div>
        <div style={{ marginTop: 4, fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, lineHeight: 1.45 }}>
          Today is {TIER_PHRASE[compositeBucket]}.
        </div>
      </div>
    </div>
  );
}

function Section({ ae, title, children }: { ae: ReturnType<typeof useAesthetic>['ae']; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: ae.fontDisplay,
          fontSize: 14,
          fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking,
          color: ae.text,
          paddingBottom: 6,
          borderBottom: `0.5px solid ${ae.lineStrong}`,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function textBody(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return { margin: 0, fontFamily: ae.fontBody, fontSize: 13.5, lineHeight: 1.55, color: ae.textDim };
}

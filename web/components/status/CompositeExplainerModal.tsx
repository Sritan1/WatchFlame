'use client';

// "Why this score?" — opens from a small text trigger on the Status hero
// (next to the Calibration link). Walks the user through their specific
// composite tier in four moves:
//
//   1. Tiny intro framing: "your tier comes from a matrix lookup, not a
//      weighted average."
//   2. Two component cards side-by-side: Weather (raw V4 + regional tier +
//      regional context) and Threat (score + driving fire if any).
//   3. The matrix grid — 4 rows x 5 cols, user's cell highlighted with
//      glow, row & column emphasized for cross-hatch readability.
//   4. Outcome callout below the grid: "your row x your column = HIGH"
//      with a sentence of plain-English rationale.
//
// Pure presentational. All inputs flow from StatusScreen so the modal
// reflects exactly what the user sees on the page.

import { CompositeMatrixGrid } from '@/components/status/CompositeMatrixGrid';
import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import type { RegionalThresholds } from '@/lib/api';
import type { ThreatDriver } from '@/lib/composite-risk';
import { hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { formatDistance, type DistanceUnit } from '@/lib/use-units';

// Module-level number formatter. Pinned to en-US so SSR (Node) and the
// client browser produce identical output regardless of the client locale —
// `toLocaleString(undefined, ...)` would use ambient locale on each side
// and trigger a React hydration mismatch warning for any non-US visitor.
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
  high: 'a high-risk day — review your plan',
  extreme: 'an extreme-risk day — prepare to act',
};

export function CompositeExplainerModal({
  open,
  onClose,
  weatherBucket,
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
  /** User's weather tier (LOW/MOD/HIGH/EXT) from the calibrated bucketing. */
  weatherBucket: RiskLevel | null;
  /** User's threat tier; null when no fire is within the THREAT_RADIUS_MI=50. */
  threatBucket: RiskLevel | null;
  /** Headline tier from compositeFromBuckets — already computed upstream. */
  compositeBucket: RiskLevel | null;
  /** Raw V4 fire-weather score for display ("your 0.41"). */
  weatherRawScore: number | null;
  /** Aggregate threat score (0-1) — for display under the Threat card. */
  threatSignal: number | null;
  /** Two-letter state code if calibrated; null for global fallback. */
  regionalState: string | null;
  /** Per-state thresholds (50th/75th/97th) if calibrated; null otherwise. */
  regionalThresholds: RegionalThresholds | null;
  /** Single fire driving the threat axis (named or FIRMS); null when none in range. */
  driver: ThreatDriver | null;
  distanceUnit: DistanceUnit;
}) {
  const { ae } = useAesthetic();

  return (
    <Modal open={open} onClose={onClose} eyebrow="Methodology" title="Why this score?" maxWidth={640}>
      <p style={textBody(ae)}>
        Your headline tier comes from a published <strong style={{ color: ae.text }}>lookup
        matrix</strong>, not a weighted average. Two component tiers go in (fire weather and
        active-fire threat); one headline tier comes out. Below is the cell you landed in today.
      </p>

      {/* Two component cards */}
      <div
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <ComponentCard
          ae={ae}
          label="Fire weather"
          tier={weatherBucket}
          rawScore={weatherRawScore}
          contextLine={
            regionalState && regionalThresholds
              ? `${regionalState}'s ${
                  weatherBucket === 'high'
                    ? `75th-pctile is ${regionalThresholds.moderate.toFixed(2)}, 97th is ${regionalThresholds.extreme.toFixed(2)}`
                    : weatherBucket === 'extreme'
                      ? `97th-pctile is ${regionalThresholds.extreme.toFixed(2)} (top ~3% of fire days)`
                      : weatherBucket === 'moderate'
                        ? `50th-pctile is ${regionalThresholds.low.toFixed(2)}, 75th is ${regionalThresholds.moderate.toFixed(2)}`
                        : `50th-pctile is ${regionalThresholds.low.toFixed(2)}`
                }`
              : 'Bucketed using global cutoffs (LOW <0.3 · MOD <0.6 · EXT ≥ 0.8)'
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
                ? `${driver.incident.name} — ${formatDistance(
                    driver.incident.distance_mi,
                    distanceUnit,
                    1,
                  )} away${
                    driver.incident.acres != null
                      ? `, ${ACRES_FORMAT.format(driver.incident.acres)} ac`
                      : ''
                  }`
                : `Satellite detection ${formatDistance(driver.distanceMi, distanceUnit, 1)} away`
              : `No active fires within ${formatDistance(50, distanceUnit, 0)} of your location`
          }
        />
      </div>

      {/* Matrix grid */}
      <Section ae={ae} title="The matrix">
        <p style={{ ...textBody(ae), marginBottom: 6 }}>
          Each cell is the headline tier for that combination of weather
          and threat. Your cell is highlighted; the row and column you fell
          on are emphasized so you can read horizontally and vertically.
        </p>
        <CompositeMatrixGrid
          weatherBucket={weatherBucket}
          threatBucket={threatBucket}
        />
        {/* Sub-axis labels for legibility */}
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: ae.fontMono,
            fontSize: 9.5,
            color: ae.textMute,
            letterSpacing: '0.18em',
          }}
        >
          <span>ROWS · FIRE WEATHER</span>
          <span>COLS · ACTIVE FIRE THREAT</span>
        </div>
      </Section>

      {/* Outcome callout */}
      {compositeBucket ? (
        <OutcomeCallout
          ae={ae}
          weatherBucket={weatherBucket}
          threatBucket={threatBucket}
          compositeBucket={compositeBucket}
        />
      ) : null}

      {/* Why this design (one paragraph) */}
      <Section ae={ae} title="Why a matrix and not a weighted average">
        <p style={textBody(ae)}>
          An earlier version of the formula combined the two components as{' '}
          <Mono ae={ae}>composite = 0.45 × W + 0.55 × T</Mono>. The weights weren&apos;t
          fitted to anything — they were chosen to cap weather-alone risk at MODERATE.
          The matrix encodes that same design intent directly (cell{' '}
          <Mono ae={ae}>W=EXT × T=none</Mono> reads MOD), but every cell is now visible
          and editable on its own merits instead of hidden behind two coefficients.
          See <Mono ae={ae}>docs/DECISIONS.md §6</Mono> in the repo for the full
          rationale.
        </p>
      </Section>
    </Modal>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ComponentCard({
  ae,
  label,
  tier,
  rawScore,
  contextLine,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  tier: RiskLevel | null;
  rawScore: number | null;
  contextLine: string;
}) {
  const tone = tier ? RISK_LEVELS[tier] : null;
  const rgb = tone ? hexToRgb(tone.color) : '255,255,255';
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: tone
          ? `linear-gradient(180deg, rgba(${rgb}, 0.10), rgba(${rgb}, 0.03))`
          : 'rgba(255,255,255,0.04)',
        border: tone
          ? `0.5px solid rgba(${rgb}, 0.28)`
          : `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 600,
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
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: tone?.color ?? ae.textDim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rawScore != null ? rawScore.toFixed(2) : '—'}
        </span>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 11,
            fontWeight: 700,
            color: tone?.color ?? ae.textMute,
            letterSpacing: '0.14em',
          }}
        >
          {tier ? TIER_LONG[tier] : 'NONE'}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: ae.fontBody,
          fontSize: 12,
          color: ae.textDim,
          lineHeight: 1.45,
        }}
      >
        {contextLine}
      </div>
    </div>
  );
}

function OutcomeCallout({
  ae,
  weatherBucket,
  threatBucket,
  compositeBucket,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  weatherBucket: RiskLevel | null;
  threatBucket: RiskLevel | null;
  compositeBucket: RiskLevel;
}) {
  const tone = RISK_LEVELS[compositeBucket];
  const rgb = hexToRgb(tone.color);
  const wLabel = weatherBucket ? TIER_LONG[weatherBucket] : 'PENDING';
  const tLabel = threatBucket ? TIER_LONG[threatBucket] : 'NONE';
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
      <div
        style={{
          width: 6,
          height: 56,
          borderRadius: 6,
          background: tone.color,
          boxShadow: `0 0 12px ${tone.color}`,
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
          Your matrix cell
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: ae.fontDisplay,
            fontSize: 16,
            fontWeight: 800,
            color: ae.text,
            letterSpacing: '-0.01em',
          }}
        >
          W={wLabel} × T={tLabel}{' '}
          <span style={{ color: ae.textMute, fontWeight: 600 }}>→</span>{' '}
          <span style={{ color: tone.color }}>{TIER_LONG[compositeBucket]}</span>
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: ae.fontBody,
            fontSize: 13,
            color: ae.textDim,
            lineHeight: 1.45,
          }}
        >
          Today is {TIER_PHRASE[compositeBucket]}.
        </div>
      </div>
    </div>
  );
}

function Section({
  ae,
  title,
  children,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  title: string;
  children: React.ReactNode;
}) {
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

function Mono({
  ae,
  children,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  children: React.ReactNode;
}) {
  return (
    <code
      style={{
        fontFamily: ae.fontMono,
        fontSize: 11.5,
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '1px 6px',
        borderRadius: 4,
        border: `0.5px solid ${ae.line}`,
        color: ae.text,
      }}
    >
      {children}
    </code>
  );
}

function textBody(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return {
    margin: 0,
    fontFamily: ae.fontBody,
    fontSize: 13.5,
    lineHeight: 1.55,
    color: ae.textDim,
  };
}

'use client';

// Opens from an info icon on the Regional Risk Index card.
// Explains how state-based calibration shifts the level thresholds without
// changing the score itself.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

export function CalibrationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Regional Risk Index" title="Why your level depends on your state" maxWidth={560}>
      <p style={textBody(ae)}>
        The risk <strong style={{ color: ae.text }}>score</strong> is the same calculation
        everywhere — temperature, humidity, wind, drought, and season combined. What changes
        between states is the <strong style={{ color: ae.text }}>thresholds</strong> that bucket
        the score into LOW / MOD / HIGH / EXTREME.
      </p>

      <Section ae={ae} title="What calibration does">
        <p style={textBody(ae)}>
          Each fitted state has its own historical fire-day score distribution. The thresholds
          are pegged to the <Mono ae={ae}>50th</Mono>, <Mono ae={ae}>75th</Mono>, and{' '}
          <Mono ae={ae}>90th</Mono> percentiles of those scores. A 0.40 in California (where
          conditions get more extreme more often) might bucket as HIGH, while the same 0.40 in
          Massachusetts (where it&apos;s a rare-day score) buckets as EXTREME.
        </p>
      </Section>

      <Section ae={ae} title="Where the data comes from">
        <p style={textBody(ae)}>
          Roughly 500 days per state from the{' '}
          <a
            href="https://www.fs.usda.gov/rds/archive/Catalog/RDS-2013-0009.6"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: RISK_LEVELS.low.color, textDecoration: 'none' }}
          >
            FPA Fire Occurrence Database (FPA-FOD)
          </a>{' '}
          — a USDA dataset combining state, federal, and tribal fire reports across 1.88M
          incidents. Days with significant fire activity are scored against the same V2
          algorithm; the resulting distribution gives us each state&apos;s calibration cutoffs.
        </p>
      </Section>

      <Section ae={ae} title="Why we don&apos;t just use one set of thresholds">
        <p style={textBody(ae)}>
          A flat global threshold would consistently understate risk in fire-prone states (CA, AZ,
          NV) and overstate it in wetter ones (FL, GA). Calibration makes the level reflect{' '}
          <strong style={{ color: ae.text }}>local danger</strong>, not absolute climate.
          The number itself stays comparable across states for analytical use.
        </p>
      </Section>
    </Modal>
  );
}

function Section({ ae, title, children }: { ae: ReturnType<typeof useAesthetic>['ae']; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: ae.fontDisplay,
          fontSize: 15,
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

function Mono({ ae, children }: { ae: ReturnType<typeof useAesthetic>['ae']; children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: ae.fontMono,
        fontSize: 12,
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
    fontSize: 14,
    lineHeight: 1.6,
    color: ae.textDim,
  };
}

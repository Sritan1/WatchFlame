'use client';

// Opens from an info icon on the Regional Risk Index card.
// Explains how state-based calibration shifts the level thresholds without
// changing the score itself; then renders the live 17-state ladder showing
// where the user's current V4 score lands in each state's tier band.

import { CalibrationLadder } from '@/components/status/CalibrationLadder';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { useRiskCalibration } from '@/lib/queries';
import { RISK_LEVELS } from '@/lib/theme';

export function CalibrationModal({
  open,
  onClose,
  userScore,
  userState,
}: {
  open: boolean;
  onClose: () => void;
  /** User's current raw V4 score (from /risk). Null while loading or when
   *  the request hasn't been issued yet (e.g. modal opens before risk
   *  resolves). The ladder still renders without it. */
  userScore?: number | null;
  /** User's resolved state code from /risk's regional_state. Null when the
   *  user is outside the 17 fitted states. */
  userState?: string | null;
}) {
  const { ae } = useAesthetic();
  const calibration = useRiskCalibration();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Regional Risk Index" title="Why your level depends on your state" maxWidth={620}>
      <p style={textBody(ae)}>
        The fire-weather <strong style={{ color: ae.text }}>score</strong> is the same V4
        calculation everywhere — VPD, wind, drought (KBDI), and a vegetation signal (NDVI when
        the satellite has a recent pass). What changes between states is the{' '}
        <strong style={{ color: ae.text }}>thresholds</strong> that bucket the score into LOW /
        MOD / HIGH / EXTREME.
      </p>

      {/* Live ladder — shows where the user's current score lands across
          all 17 fitted states. The "same score, different tier" headline
          becomes visceral instead of abstract. */}
      <Section ae={ae} title="Your score across all fitted states">
        {calibration.isLoading ? (
          <LadderSkeleton />
        ) : calibration.data ? (
          <CalibrationLadder
            data={calibration.data}
            userState={userState ?? null}
            userScore={userScore ?? null}
          />
        ) : (
          <p style={textBody(ae)}>
            Calibration data unavailable right now — please try again in a moment.
          </p>
        )}
      </Section>

      <Section ae={ae} title="What calibration does">
        <p style={textBody(ae)}>
          Each fitted state has its own historical fire-day score distribution. The thresholds
          are pegged to the <Mono ae={ae}>50th</Mono>, <Mono ae={ae}>75th</Mono>, and{' '}
          <Mono ae={ae}>97th</Mono> percentiles of those scores. A 0.40 in California (where
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
          incidents. Days with significant fire activity are scored against the same V4
          algorithm; the resulting distribution gives us each state&apos;s calibration cutoffs.
        </p>
      </Section>

      <Section ae={ae} title="How this feeds your composite">
        <p style={textBody(ae)}>
          The calibration-aware fire-weather bucket is the <Mono ae={ae}>w</Mono> half of the{' '}
          <strong style={{ color: ae.text }}>Personal Threat composite</strong> on this page.
          The other half (<Mono ae={ae}>t</Mono>) measures any active fires near you. Pegging
          <Mono ae={ae}> w</Mono> to your state&apos;s history means the composite reflects{' '}
          <strong style={{ color: ae.text }}>local danger</strong>, not absolute climate —
          critical for the same composite score to mean the same thing in CA as in FL.
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

function LadderSkeleton() {
  // Roughly mirror the row count + heights so the modal doesn't reflow when
  // calibration resolves. Eight placeholder rows are enough to suggest the
  // shape without rendering all 17.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr 48px',
            columnGap: 12,
            alignItems: 'center',
          }}
        >
          <Skeleton width={20} height={10} rounded="sm" />
          <Skeleton width="100%" height={7} rounded="full" />
          <Skeleton width={36} height={10} rounded="sm" />
        </div>
      ))}
    </div>
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

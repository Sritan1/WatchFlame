'use client';

// Explains how per-state calibration shifts the tier thresholds without changing
// the score, then renders the ladder showing where the user's score lands in each
// state's bands.

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
  /** The raw fire-weather score. Null while /risk is still resolving, and the
   *  ladder renders without it. */
  userScore?: number | null;
  /** Null when the user is outside the fitted states. */
  userState?: string | null;
}) {
  const { ae } = useAesthetic();
  const calibration = useRiskCalibration();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Regional Risk Index" title="Why your level depends on your state" maxWidth={620}>
      <p style={textBody(ae)}>
        The fire-weather <strong style={{ color: ae.text }}>score</strong>{' '}is calculated the same
        way everywhere. What changes from state to state is where the{' '}
        <strong style={{ color: ae.text }}>cutoffs</strong>{' '}fall between Low, Moderate, High, and
        Extreme.
      </p>

      {/* Live ladder showing where the current score lands in all 17 fitted
          states, which makes "same score, different tier" concrete. */}
      <Section ae={ae} title="Your score in every calibrated state">
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
            Calibration data isn&apos;t available right now. Try again in a moment.
          </p>
        )}
      </Section>

      <Section ae={ae} title="What calibration does">
        <p style={textBody(ae)}>
          Each calibrated state has its own track record of fire-prone days, and the score is graded
          against that record. A 0.40 in California, where dangerous days are common, might land as
          High. The same 0.40 in Massachusetts, where that&apos;s a rare reading, lands as Extreme.
        </p>
      </Section>

      <Section ae={ae} title="Where the data comes from">
        <p style={textBody(ae)}>
          The cutoffs come from real fire records, not guesses. They are based on the{' '}
          <a
            href="https://www.fs.usda.gov/rds/archive/Catalog/RDS-2013-0009.6"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: RISK_LEVELS.low.color, textDecoration: 'none' }}
          >
            FPA Fire Occurrence Database
          </a>
          , a US government dataset of about 1.88 million past fires that shows how often each state
          actually sees dangerous conditions.
        </p>
      </Section>

      <Section ae={ae} title="How this feeds your overall risk">
        <p style={textBody(ae)}>
          On this page, this state-aware level is one of the signals behind your overall risk. It is
          combined with how likely a fire is to start, and with any active fires near you. Grading by
          state keeps your overall risk meaningful wherever you live, so it means the same thing in
          California as in Florida.
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

function LadderSkeleton() {
  // Roughly mirrors the row count and heights, so the modal doesn't reflow when
  // calibration resolves.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
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

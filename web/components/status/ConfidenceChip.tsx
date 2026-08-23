'use client';

// The confidence chip under the Status subtitle. Two words, color-coded, and it
// opens the breakdown. Which signal is holding it back is a question for the
// modal, not for a chip.

import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type {
  ConfidenceLevel,
  ConfidenceResult,
  ConfidenceSignal,
} from '@/lib/confidence';

// Duller than the risk palette. This is a note about the data, not a verdict on
// the fire.
const TONE: Record<ConfidenceLevel, { color: string; rgb: string; label: string }> = {
  high:   { color: '#3FB68B', rgb: '63, 182, 139',  label: 'High confidence' },
  medium: { color: '#E8B339', rgb: '232, 179, 57',  label: 'Medium confidence' },
  low:    { color: '#F04438', rgb: '240, 68, 56',   label: 'Low confidence' },
};

const STATUS_GLYPH = {
  good: '✓',
  warn: '!',
  bad:  '✕',
} as const;

const STATUS_TONE = {
  good: { color: '#3FB68B', rgb: '63, 182, 139' },
  warn: { color: '#E8B339', rgb: '232, 179, 57' },
  bad:  { color: '#F04438', rgb: '240, 68, 56' },
} as const;

// Chip

export function ConfidenceChip({
  confidence,
  onOpen,
}: {
  confidence: ConfidenceResult;
  onOpen: () => void;
}) {
  const { ae } = useAesthetic();

  if (confidence.loading || confidence.level === null) {
    return <Skeleton width={158} height={26} rounded="full" />;
  }

  const tone = TONE[confidence.level];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${tone.label}, open breakdown`}
      className="ember-fade-up"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px 5px 10px',
        borderRadius: 99,
        background: `linear-gradient(180deg, rgba(${tone.rgb}, 0.16), rgba(${tone.rgb}, 0.06))`,
        border: `0.5px solid rgba(${tone.rgb}, 0.40)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        cursor: 'pointer',
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        color: tone.color,
        textTransform: 'uppercase',
        animationDelay: '660ms',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = `0 6px 16px rgba(${tone.rgb}, 0.18), inset 0 1px 0 rgba(255,255,255,0.05)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05)';
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 99,
          background: tone.color,
          boxShadow: `0 0 8px ${tone.color}`,
          flexShrink: 0,
        }}
      />
      {tone.label}
    </button>
  );
}

// Breakdown modal

export function ConfidenceBreakdownModal({
  open,
  onClose,
  confidence,
}: {
  open: boolean;
  onClose: () => void;
  confidence: ConfidenceResult;
}) {
  const { ae } = useAesthetic();
  // Grey until there is a real answer, so the row never claims a level it doesn't
  // have.
  const tone = confidence.level
    ? TONE[confidence.level]
    : { color: 'rgba(255,255,255,0.55)', rgb: '255,255,255', label: 'Resolving…' };

  return (
    <Modal open={open} onClose={onClose} eyebrow="Data Quality" title="Confidence breakdown" maxWidth={560}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: ae.textDim,
        }}
      >
        This shows each piece of data behind your overall risk, and whether it&apos;s current and
        reliable. Your confidence is only as strong as the{' '}
        <strong style={{ color: ae.text }}>weakest piece</strong>. One stale or estimated input drops
        it to Medium. Two or more, or one that is completely unavailable, drops it to Low.
      </p>

      {/* Signal rows */}
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          border: `0.5px solid ${ae.line}`,
          overflow: 'hidden',
        }}
      >
        {confidence.signals.map((s, i) => (
          <SignalRow key={s.label} ae={ae} signal={s} isLast={i === confidence.signals.length - 1} />
        ))}
      </div>

      {/* Outcome */}
      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 10,
          background: `linear-gradient(180deg, rgba(${tone.rgb}, 0.12), rgba(${tone.rgb}, 0.04))`,
          border: `0.5px solid rgba(${tone.rgb}, 0.42)`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: tone.color,
            boxShadow: `0 0 8px ${tone.color}`,
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
            Overall
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: ae.fontDisplay,
              fontSize: 16,
              fontWeight: 800,
              color: tone.color,
              letterSpacing: '-0.005em',
            }}
          >
            {tone.label}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SignalRow({
  ae,
  signal,
  isLast,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  signal: ConfidenceSignal;
  isLast: boolean;
}) {
  const statusTone = STATUS_TONE[signal.status];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto',
        columnGap: 12,
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.015)',
        borderBottom: isLast ? 'none' : `0.5px solid ${ae.line}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          background: `rgba(${statusTone.rgb}, 0.18)`,
          border: `0.5px solid rgba(${statusTone.rgb}, 0.45)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 800,
          color: statusTone.color,
        }}
      >
        {STATUS_GLYPH[signal.status]}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 13.5,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: '-0.005em',
          }}
        >
          {signal.label}
        </div>
      </div>
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 11,
          color: ae.textDim,
          letterSpacing: '0.02em',
          textAlign: 'right',
        }}
      >
        {signal.value}
      </span>
    </div>
  );
}

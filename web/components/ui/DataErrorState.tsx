'use client';

// Shared "we couldn't load this" failure state.
//
// Three distinct states a data surface can be in:
//   1. loading  — request in flight        → skeleton
//   2. empty    — loaded, nothing to show  → success/empty copy
//   3. FAILED   — request errored          → THIS component
//
// Before this existed, screens collapsed (3) into (1) or (2): an API error
// looked like a perpetual skeleton, or — worse, on Safety — like a successful
// "All Clear". The tone here is deliberately NEUTRAL SLATE: it must not read as
// any risk tier, since green (safe) / amber (moderate) / red (danger) would all
// imply a verdict we can't actually make with no data. The warning glyph is the
// only warm accent.
//
// `compact` switches between the prominent card (replacing a hero/banner) and a
// small inline note (a single card or rail slot that failed).

import { Icon } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';

const SLATE_RGB = '148, 163, 184';
const AMBER = '#E8B339';

export function DataErrorState({
  title,
  message,
  onRetry,
  compact = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { ae } = useAesthetic();

  const retryButton = onRetry ? (
    <button
      type="button"
      onClick={onRetry}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: compact ? 0 : 14,
        padding: compact ? '5px 11px' : '7px 13px',
        borderRadius: 8,
        background: 'transparent',
        border: `0.5px solid rgba(${SLATE_RGB}, 0.35)`,
        color: ae.text,
        cursor: 'pointer',
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="refresh" size={12} color={ae.textDim} strokeWidth={1.8} />
      Retry
    </button>
  ) : null;

  return (
    <div
      role="alert"
      style={{
        padding: compact ? '12px 14px' : '20px 22px',
        borderRadius: compact ? 10 : ae.radiusLg,
        background: `linear-gradient(180deg, rgba(${SLATE_RGB}, 0.06), rgba(${SLATE_RGB}, 0.02))`,
        border: `0.5px solid rgba(${SLATE_RGB}, 0.28)`,
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        gap: compact ? 12 : 16,
      }}
    >
      <Icon name="warn" size={compact ? 16 : 20} color={AMBER} strokeWidth={1.8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: compact ? 13.5 : 16,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: compact ? 2 : 6,
            fontFamily: ae.fontBody,
            fontSize: compact ? 12 : 13.5,
            lineHeight: 1.5,
            color: ae.textDim,
            maxWidth: 560,
          }}
        >
          {message}
        </div>
        {!compact ? retryButton : null}
      </div>
      {compact ? retryButton : null}
    </div>
  );
}

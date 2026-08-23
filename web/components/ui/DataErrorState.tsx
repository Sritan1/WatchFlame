'use client';

// The shared "couldn't load this" state. Loading, empty and broken are three
// different things, and broken used to collapse into one of the others, so an API
// error looked like a skeleton or an all-clear. Grey avoids implying a verdict.

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

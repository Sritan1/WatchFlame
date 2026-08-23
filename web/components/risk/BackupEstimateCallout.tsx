'use client';

// The dismissible amber callout, shared by the drought and vegetation panels. Only
// the sentence inside differs. The parent tracks dismissal because it also re-centers
// its own content once this goes away.

import type { ReactNode } from 'react';

import { Icon } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

const AMBER = RISK_LEVELS.moderate.color;
const AMBER_RGB = RISK_LEVELS.moderate.glow;

export function BackupEstimateCallout({
  body,
  onDismiss,
}: {
  /** The sentence after the bold "Backup estimate." lead-in. */
  body: ReactNode;
  onDismiss: () => void;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        borderRadius: 10,
        background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.05), rgba(${AMBER_RGB}, 0.02))`,
        border: `0.5px solid rgba(${AMBER_RGB}, 0.22)`,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: `rgba(${AMBER_RGB}, 0.12)`,
          border: `0.5px solid rgba(${AMBER_RGB}, 0.30)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="info" size={11} color={AMBER} strokeWidth={1.6} />
      </div>
      <span
        style={{
          flex: 1,
          fontFamily: ae.fontBody,
          fontSize: 12.5,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        <span style={{ color: AMBER, fontWeight: 600 }}>Backup estimate. </span>
        {body}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          marginTop: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          borderRadius: 6,
          background: 'transparent',
          border: 'none',
          color: ae.textMute,
          cursor: 'pointer',
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = ae.text;
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = ae.textMute;
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Icon name="x" size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}

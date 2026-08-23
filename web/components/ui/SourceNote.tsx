'use client';

// The small "this feed is down" note, used wherever a single source can fail
// without the whole screen erroring, so an empty result is never misread as
// "nothing here". The wording lives in lib/source-health.ts.

import { useAesthetic } from '@/lib/aesthetic';

export function SourceNote({
  text,
  style,
}: {
  text: string;
  style?: React.CSSProperties;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        // Aligned to the first line, not centered, so the dot stays put when the
        // text wraps on a narrow screen.
        alignItems: 'flex-start',
        gap: 7,
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        lineHeight: 1.35,
        letterSpacing: '0.04em',
        color: ae.textDim,
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          flexShrink: 0,
          // Nudged down onto the first line's optical center.
          marginTop: 4,
          background: '#E8B339',
          boxShadow: '0 0 8px rgba(232, 179, 57, 0.6)',
        }}
      />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

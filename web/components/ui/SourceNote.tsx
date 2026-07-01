'use client';

// Small, non-blocking "this feed is down" note: an amber dot + a short line of
// mono text. Used wherever a single data source can fail without the whole
// screen erroring, so an empty result is never misread as "nothing here".
// Copy for each note lives in lib/sourceHealth.ts.

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
        // flex-start (not center) so the dot stays aligned to the FIRST line
        // when the text wraps to two lines on a narrow / mobile width.
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
          // Nudge down to sit on the first line's optical center (~14px line box).
          marginTop: 4,
          background: '#E8B339',
          boxShadow: '0 0 8px rgba(232, 179, 57, 0.6)',
        }}
      />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  );
}

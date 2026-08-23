'use client';

// The chip beside the confidence one, saying whether the next few hours look worse,
// the same or better. One short phrase. The reasoning lives in the phase-space
// modal this opens.

import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { TrajectoryResponse, TrajectoryTier } from '@/lib/api';

// Duller than the risk palette. This is a direction, not a severity. The pill next
// to it carries the tier.
const TONE: Record<
  TrajectoryTier,
  { color: string; rgb: string; label: string; glyph: string }
> = {
  rising:  { color: '#FF7A3A', rgb: '255, 122, 58',  label: 'Rising',  glyph: '↑' },
  steady:  { color: '#9ca3af', rgb: '156, 163, 175', label: 'Steady',  glyph: '→' },
  falling: { color: '#3FB68B', rgb: '63, 182, 139',  label: 'Falling', glyph: '↓' },
};

export function TrajectoryChip({
  trajectory,
  isLoading,
  isError = false,
  onOpen,
}: {
  trajectory: TrajectoryResponse | null | undefined;
  isLoading: boolean;
  /** The forecast is an extra signal, so on failure the chip steps aside instead of
   *  skeletoning forever. */
  isError?: boolean;
  /** Opens the phase-space modal, where the reasoning lives. */
  onOpen: () => void;
}) {
  const { ae } = useAesthetic();

  // No forecast, from either a failure or nothing available here. Say so in grey
  // and stay clickable. Vanishing would be worse.
  if (isError || trajectory === null) {
    const SLATE = '148, 163, 184';
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Forecast unavailable, open for details"
        className="ember-fade-up"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 12px 5px 10px',
          borderRadius: 99,
          background: `linear-gradient(180deg, rgba(${SLATE}, 0.14), rgba(${SLATE}, 0.05))`,
          border: `0.5px solid rgba(${SLATE}, 0.38)`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          cursor: 'pointer',
          fontFamily: ae.fontMono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: ae.textDim,
          textTransform: 'uppercase',
          animationDelay: '720ms',
        }}
      >
        <Icon name="warn" size={12} color="#E8B339" strokeWidth={1.8} />
        Forecast unavailable
      </button>
    );
  }

  // The slot has to hold something while the query settles, or the chip appears
  // to come and go during a location switch.
  if (isLoading || trajectory === undefined) {
    return <Skeleton width={132} height={26} rounded="full" />;
  }

  const tone = TONE[trajectory.tier];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Trajectory ${tone.label}, open phase-space view`}
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
        animationDelay: '720ms',
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
        aria-hidden
        style={{
          fontFamily: ae.fontMono,
          fontSize: 13,
          fontWeight: 800,
          color: tone.color,
          textShadow: `0 0 6px ${tone.color}`,
          lineHeight: 1,
        }}
      >
        {tone.glyph}
      </span>
      {tone.label}
    </button>
  );
}

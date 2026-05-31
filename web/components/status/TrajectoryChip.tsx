'use client';

// Trajectory chip — short-term forward-looking signal sits next to the
// confidence chip below the Status hero subtitle. Three tiers driven by
// the backend's projected V4-score delta over the next 6 hours:
//
//   RISING  — conditions deteriorating; orange tone, arrow-up glyph
//   STEADY  — no material change; muted tone, dash glyph
//   FALLING — conditions improving; green tone, arrow-down glyph
//
// Single tight string per design constraint we established for the
// confidence chip. Reason/context (e.g. "VPD +18% by 3pm") lives in the
// upcoming phase-space modal triggered separately — keeps this chip
// readable at a glance.

import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { TrajectoryResponse, TrajectoryTier } from '@/lib/api';

// Tone palette — orange/grey/green, deliberately desaturated vs the
// risk-level palette so trajectory reads as direction (a vector), not
// a tier (a level). The composite tier color comes from the orb pill
// next to it; trajectory adds the second dimension.
const TONE: Record<
  TrajectoryTier,
  { color: string; rgb: string; label: string; glyph: string }
> = {
  rising:  { color: '#FF7A3A', rgb: '255, 122, 58',  label: 'Rising',  glyph: '↑' /* ↑ */ },
  steady:  { color: '#9ca3af', rgb: '156, 163, 175', label: 'Steady',  glyph: '→' /* → */ },
  falling: { color: '#3FB68B', rgb: '63, 182, 139',  label: 'Falling', glyph: '↓' /* ↓ */ },
};

export function TrajectoryChip({
  trajectory,
  isLoading,
  onOpen,
}: {
  trajectory: TrajectoryResponse | null | undefined;
  isLoading: boolean;
  /** Opens the 2D phase-space modal where the projection arrow + driver
   *  context live. */
  onOpen: () => void;
}) {
  const { ae } = useAesthetic();

  // Skeleton when the chip can't render anything determinate yet.
  // Two cases: TanStack hasn't started the query (data === undefined)
  // or it's actively fetching (isLoading === true). Either way the user
  // should see SOMETHING in the chip slot rather than the chip silently
  // disappearing — that was confusing during location switches.
  if (isLoading || trajectory === undefined) {
    return <Skeleton width={132} height={26} rounded="full" />;
  }

  // Backend explicitly returned null — Open-Meteo unavailable for this
  // location, etc. Hide the chip rather than render a misleading default.
  // The composite tier is still valid from /risk; trajectory is additive.
  if (trajectory === null) return null;

  const tone = TONE[trajectory.tier];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Trajectory ${tone.label} — open phase-space view`}
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

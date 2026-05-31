'use client';

// Full-width Dominant Driver hero card. Sits below the inputs grid on the
// Risk page. Left side: eyebrow + driver name + description. Right side: a
// 3-column share strip (VPD / Wind / Drought) with domain-colored
// percentages so the user can see all three factor shares at once instead
// of just the dominant one.
//
// Premium chrome mirrors HeroScorePanel's pattern: ember-hero-card for the
// top accent stripe + corner halo pseudo-elements, GridPattern overlay for
// the technical/measured feel, red-tinted border + bottom-left radial glow
// for the "this is the driver" emphasis.
//
// File name is historical — this used to be a sticky right-rail housing
// multiple insight cards. Trimmed to one card, then promoted to a
// full-width hero when the inputs grid was restructured.

import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

// Domain colors for the three share columns. Red reads as heat (VPD), blue
// reads as wind, amber reads as soil dryness (drought). Lets the user scan
// the strip without reading labels.
const SHARE_COLORS = {
  vpd: '#F04438',
  wind: '#4DA3FF',
  drought: '#E8B339',
} as const;

export function InsightsRail({
  dominantLabel,
  dominantDescription,
  shares,
  isLoading = false,
}: {
  dominantLabel: string;
  dominantDescription: string;
  /** Raw 0-1 factor values straight from the /risk response — each one's
   *  own share of its individual factor, not weighted contributions. */
  shares: { vpd: number; wind: number; drought: number };
  /** When true, replace the inner content (driver name + description +
   *  3 share columns) with skeleton placeholders. The full chrome (border,
   *  grid pattern, top stripe, halos) stays visible so the card doesn't
   *  pop in/out across location switches — matches the rhythm of the
   *  InputPanel / VegetationPanel / DroughtPanel loading states. */
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();
  const accent = RISK_LEVELS.extreme.color;
  const accentGlow = RISK_LEVELS.extreme.glow;
  return (
    <div
      className="ember-card ember-hero-card ember-card-hover"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${accentGlow}, 0.22)`,
        borderRadius: ae.radiusLg,
        padding: 24,
        boxShadow: `0 18px 48px rgba(${accentGlow}, 0.08)`,
        ['--card-accent' as string]: accent,
        ['--card-accent-soft' as string]: `rgba(${accentGlow}, 0.12)`,
      }}
    >
      {/* Faint grid texture — same technical feel as HeroScorePanel + the
       *  Status hero cards. 4% opacity stays barely-there but adds the
       *  "measured instrument" character the reference has. */}
      <GridPattern opacity={0.04} />

      {/* Bottom-left corner halo — complements ember-hero-card's built-in
       *  top-right halo (::after) and the top stripe (::before). Together
       *  they form a diagonal red gradient across the card matching the
       *  reference's glow. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -90,
          left: -90,
          width: 280,
          height: 280,
          pointerEvents: 'none',
          background: `radial-gradient(circle at center, rgba(${accentGlow}, 0.14), transparent 70%)`,
          filter: 'blur(22px)',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Eyebrow color={accent}>Dominant driver</Eyebrow>
          {isLoading ? (
            <>
              <div style={{ marginTop: 10 }}>
                <Skeleton width={260} height={30} rounded="md" />
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton width="92%" height={11} rounded="sm" />
                <Skeleton width="68%" height={11} rounded="sm" />
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: ae.fontDisplay,
                  fontSize: 30,
                  fontWeight: ae.titleWeight,
                  letterSpacing: '-0.02em',
                  color: ae.text,
                  lineHeight: 1.05,
                }}
              >
                {dominantLabel}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: ae.fontBody,
                  fontSize: 13,
                  color: ae.textDim,
                  lineHeight: 1.45,
                  maxWidth: 460,
                }}
              >
                {dominantDescription}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 18,
            justifyItems: 'end',
          }}
        >
          {isLoading ? (
            <>
              <ShareSkeleton />
              <ShareSkeleton />
              <ShareSkeleton />
            </>
          ) : (
            <>
              <ShareColumn label="VPD share" pct={shares.vpd} color={SHARE_COLORS.vpd} />
              <ShareColumn label="Wind share" pct={shares.wind} color={SHARE_COLORS.wind} />
              <ShareColumn label="Drought" pct={shares.drought} color={SHARE_COLORS.drought} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <Skeleton width={64} height={10} rounded="sm" />
      <Skeleton width={56} height={28} rounded="md" />
    </div>
  );
}

function ShareColumn({
  label,
  pct,
  color,
}: {
  label: string;
  /** 0-1 factor value; rendered as a percentage. */
  pct: number;
  color: string;
}) {
  const { ae } = useAesthetic();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <span
        style={{
          fontFamily: ae.fontDisplay,
          fontSize: 32,
          fontWeight: ae.titleWeight,
          color,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {Math.round(pct * 100)}
        <span style={{ fontSize: 18, marginLeft: 1 }}>%</span>
      </span>
    </div>
  );
}

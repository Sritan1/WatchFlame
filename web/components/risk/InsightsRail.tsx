'use client';

// The card under the sliders naming what's driving the score, with all three factor
// shares alongside it and not just the winner. The name is left over from when this
// was a rail of several cards down the right side.

import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { FACTOR_COLORS, RISK_LEVELS } from '@/lib/theme';

export function InsightsRail({
  dominantLabel,
  dominantDescription,
  shares,
  isLoading = false,
}: {
  dominantLabel: string;
  dominantDescription: string;
  /** Each factor's weighted share, worked out the same way the driver is picked,
   *  so the named one is always the biggest and the three add to 100%. */
  shares: { vpd: number; wind: number; drought: number };
  /** Skeletons the contents but keeps the card, so it doesn't pop in and out
   *  across a location switch. */
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();
  const accent = RISK_LEVELS.extreme.color;
  const accentGlow = RISK_LEVELS.extreme.glow;
  return (
    <div
      className="ember-card ember-hero-card"
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
      {/* Same faint grid the hero card uses. */}
      <GridPattern opacity={0.04} />

      {/* Opposite corner from the card's own glow, so the two make a diagonal. */}
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
        className="app-stack"
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
              <ShareColumn label="VPD share" pct={shares.vpd} color={FACTOR_COLORS.vpd.color} />
              <ShareColumn label="Wind share" pct={shares.wind} color={FACTOR_COLORS.wind.color} />
              <ShareColumn label="Drought" pct={shares.drought} color={FACTOR_COLORS.drought.color} />
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
  /** The share, drawn as a percentage. */
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

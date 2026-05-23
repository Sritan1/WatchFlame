'use client';

// Sticky right column of the inputs section — just the Dominant Driver card.
// (Earlier the rail had "To bring score below high" and "Methodology paper"
// links too. Both were removed: the suggestions card faked precise deltas
// we can't actually compute, and the methodology card pointed at a paper
// that doesn't exist — the real "How is this calculated?" button in the
// FactorBreakdown footer opens the methodology explainer.)

import { Eyebrow } from '@/components/ui/Eyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

export function InsightsRail({
  dominantLabel,
  dominantContributionPct,
  dominantDescription,
}: {
  dominantLabel: string;
  dominantContributionPct: number;
  dominantDescription: string;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'sticky',
        top: 84,
        alignSelf: 'flex-start',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          padding: 18,
        }}
      >
        <Eyebrow color={RISK_LEVELS.extreme.color}>Dominant driver</Eyebrow>
        <div
          style={{
            marginTop: 8,
            fontFamily: ae.fontDisplay,
            fontSize: 24,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.02em',
            color: ae.text,
            lineHeight: 1.1,
          }}
        >
          {dominantLabel}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: ae.fontBody,
            fontSize: 13,
            color: ae.textDim,
            lineHeight: 1.4,
          }}
        >
          Contributing {dominantContributionPct.toFixed(0)}% of total risk. {dominantDescription}
        </div>
      </div>
    </div>
  );
}

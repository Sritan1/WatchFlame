'use client';

// Single KPI tile — uppercase label + (optional decoration top-right) + big
// number + optional unit + trend line. Used in the 4-up row below the hero.

import type { ReactNode } from 'react';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';

export function KpiTile({
  label,
  value,
  unit,
  trend,
  color,
  decoration,
  animate = true,
}: {
  label: string;
  value: number | string;
  unit?: string;
  trend?: string;
  color?: string;
  decoration?: ReactNode;
  animate?: boolean;
}) {
  const { ae } = useAesthetic();
  const isNumber = typeof value === 'number';

  return (
    <TiltCard
      max={3}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025), transparent)',
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: '18px 18px 16px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Eyebrow>{label}</Eyebrow>
        {decoration}
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontFamily: ae.fontDisplay,
          fontWeight: ae.titleWeight,
          letterSpacing: '-0.025em',
          color: color ?? ae.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontSize: 36, lineHeight: 1 }}>
          {animate && isNumber ? (
            <AnimatedNumber
              value={value}
              format={(n) => (Number.isInteger(value as number) ? Math.round(n).toString() : n.toFixed(1))}
            />
          ) : (
            value
          )}
        </span>
        {unit ? (
          <span style={{ fontSize: 13, color: ae.textDim, fontWeight: 400 }}>{unit}</span>
        ) : null}
      </div>
      {trend ? (
        <div
          style={{
            marginTop: 6,
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            color: ae.textDim,
            letterSpacing: '0.06em',
          }}
        >
          {trend}
        </div>
      ) : null}
    </TiltCard>
  );
}

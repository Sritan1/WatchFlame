'use client';

// Vignetted background region — wraps a section in an animated background
// (currently WavesBackground) plus a bottom fade-to-bg gradient so content
// below the band starts on solid color again.

import type { ReactNode } from 'react';

import { WavesBackground } from '@/components/WavesBackground';
import { useAesthetic } from '@/lib/aesthetic';
import type { RiskLevel } from '@/lib/theme';

export function HeroBand({
  risk = 'moderate',
  pulseSpeed = 70,
  height,
  children,
}: {
  risk?: RiskLevel;
  pulseSpeed?: number;
  height?: number | string;
  children: ReactNode;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      className="ember-grain"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: ae.bg,
        minHeight: height ?? 'auto',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <WavesBackground risk={risk} pulseSpeed={pulseSpeed} />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          background: `linear-gradient(180deg, transparent 0%, transparent 70%, ${ae.bg} 100%)`,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}

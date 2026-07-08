'use client';

// Segmented control with glass/glow on the active segment.
// Reused by Risk (Season vs NDVI) and Safety (Away From Fire vs Nearest Shelter).

import { useAesthetic } from '@/lib/aesthetic';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

export function GlassSegmented<T extends string>({
  value,
  options,
  onChange,
  glowRgb,
  size = 'md',
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (id: T) => void;
  glowRgb: string;
  size?: 'sm' | 'md';
}) {
  const { ae } = useAesthetic();
  const h = size === 'sm' ? 32 : 38;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 4,
        padding: 4,
        borderRadius: ae.radius,
        background: 'rgba(0, 0, 0, 0.30)',
        border: `0.5px solid ${ae.line}`,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            style={{
              height: h,
              borderRadius: ae.radius - 4,
              border: 'none',
              background: active
                ? `linear-gradient(180deg, rgba(${glowRgb}, 0.95), rgba(${glowRgb}, 0.72))`
                : 'transparent',
              color: active ? '#fff' : ae.textMute,
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.2, 0.7, 0.3, 1)',
              boxShadow: active
                ? `0 4px 14px rgba(${glowRgb}, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Convenience alias so unknown<T> doesn't leak into callers
export type AnyGlassOption = SegmentedOption<string>;

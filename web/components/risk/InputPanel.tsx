'use client';

// One slider tile — big numeric value + custom-drawn slider track with an
// invisible native <input type="range"> overlay for actual interaction (so
// keyboard ←/→/Home/End all work out of the box).

import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { IndexBadge } from '@/components/ui/IndexBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';

export function InputPanel({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  color,
  glowRgb,
  caption,
  index,
  onChange,
  isLoading = false,
  footer,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  color: string;
  glowRgb: string;
  caption?: string;
  index: number;
  onChange: (v: number) => void;
  /** When true, render skeleton placeholders for the value + slider track
   *  (matches mobile SliderRow's isLoading state during auto-seed wait). */
  isLoading?: boolean;
  /** Optional footer slot rendered inside the card below the caption — used
   *  for "couldn't fetch" warnings tied to specific sliders (KBDI, NDVI). */
  footer?: ReactNode;
}) {
  const { ae } = useAesthetic();
  // Clamp to the track: a seeded local reading can land outside the slider's
  // [min,max] (e.g. an 80 km/h wind on the 0-60 dial, or 45 days-since-rain on
  // the 0-30 dial). Without clamping, pct exceeds 100% and shoves the fill +
  // thumb off the visible track (clipped by the card's overflow:hidden).
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)));
  const display = value.toFixed(decimals);

  if (isLoading) {
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          padding: 18,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Skeleton width={90} height={10} rounded="sm" />
          <Skeleton width={20} height={10} rounded="sm" />
        </div>
        <div style={{ marginTop: 12 }}>
          <Skeleton width={140} height={42} rounded="md" />
        </div>
        <div style={{ marginTop: 18, marginBottom: 8 }}>
          <Skeleton width={'100%'} height={6} rounded="full" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Skeleton width={28} height={10} rounded="sm" />
          <Skeleton width={28} height={10} rounded="sm" />
        </div>
        {caption ? (
          <div style={{ marginTop: 14 }}>
            <Skeleton width={'85%'} height={11} rounded="sm" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="ember-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow>{label}</Eyebrow>
        <IndexBadge n={index} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 40,
            fontWeight: ae.titleWeight,
            color: ae.text,
            letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {display}
        </span>
        {unit ? (
          <span style={{ fontFamily: ae.fontMono, fontSize: 14, color: ae.textDim }}>{unit}</span>
        ) : null}
      </div>

      {/* Custom slider */}
      <div
        style={{
          position: 'relative',
          height: 36,
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 5,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 0.5,
                height: i % 5 === 0 ? 5 : 3,
                background: i % 5 === 0 ? ae.lineStrong : ae.line,
              }}
            />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 17,
            height: 6,
            borderRadius: 99,
            background: 'rgba(255, 255, 255, 0.05)',
            boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.4)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 17,
            width: `${pct}%`,
            height: 6,
            borderRadius: 99,
            background: `linear-gradient(90deg, rgba(${glowRgb}, 0.65), ${color})`,
            boxShadow: `0 0 10px ${color}`,
            transition: 'width 0.2s',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `calc(${pct}% - 12px)`,
            top: 8,
            width: 24,
            height: 24,
            borderRadius: 99,
            background: '#fff',
            boxShadow: `0 2px 10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(${glowRgb}, 0.45), inset 0 -1px 0 rgba(0, 0, 0, 0.08)`,
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: ae.fontMono,
          fontSize: 10,
          color: ae.textMute,
          letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {min}
          {unit ?? ''}
        </span>
        <span>
          {max}
          {unit ?? ''}
        </span>
      </div>

      {caption ? (
        <p
          style={{
            margin: '12px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 12,
            lineHeight: 1.5,
            color: ae.textMute,
          }}
        >
          {caption}
        </p>
      ) : null}
      {footer}
    </div>
  );
}

'use client';

import { useId } from 'react';

// A flame-tipped W, so the initial doubles as the flame. The sidebar and the
// topbar both render this. app/icon.svg repeats the same paths by hand, so if you
// change one, change the other.

export function BrandMark({
  size = 32,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  // Per-instance gradient ids, because the sidebar and topbar can both be mounted.
  // useId can contain a colon, which is invalid inside url(), so strip it.
  const id = 'wf' + useId().replace(/:/g, '');
  const inner = Math.round((size * 23) / 32);

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Opaque, so the mark also holds up as a favicon.
        background:
          'linear-gradient(160deg, rgba(255,122,58,0.16), rgba(255,122,58,0.04)), #100b0a',
        border: '0.5px solid rgba(255,122,58,0.40)',
        boxShadow:
          '0 0 18px rgba(255,122,58,0.28), inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -2px 4px rgba(0,0,0,0.28)',
        ...style,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id={`${id}w`} x1="24" y1="40" x2="24" y2="6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFC15A" />
            <stop offset=".5" stopColor="#FF7A3A" />
            <stop offset="1" stopColor="#F04438" />
          </linearGradient>
          <linearGradient id={`${id}s`} x1="24" y1="24" x2="44" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF7A3A" stopOpacity="0.9" />
            <stop offset="1" stopColor="#FF7A3A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fading radar sweep arc off the mark */}
        <path fill="none" stroke={`url(#${id}s)`} strokeWidth="2.2" strokeLinecap="round" d="M24 24 A 19 19 0 0 1 41 13.5" />
        {/* Faint trailing arc on the opposite side */}
        <path fill="none" stroke="#FF7A3A" strokeOpacity="0.3" strokeWidth="1.6" strokeLinecap="round" d="M8 33 A 19 19 0 0 1 7 21" />
        {/* Flame-tipped W */}
        <g transform="translate(0,0.5) scale(0.8) translate(6,5.2)">
          <path fill={`url(#${id}w)`} d="M6 15 C6 12 10.6 11.4 11.6 14.4 L16.4 29 L20.6 17.4 C21.4 12.5 22.6 10 24 6 C25.4 10 26.6 12.5 27.4 17.4 L31.6 29 L36.4 14.4 C37.4 11.4 42 12 42 15 C42 17 36.8 33 35.2 37.2 C34.4 39.4 31 39.4 30.2 37.2 L24 22 L17.8 37.2 C17 39.4 13.6 39.4 12.8 37.2 C11.2 33 6 17 6 15 Z" />
        </g>
        {/* Emitter ping */}
        <circle cx="41" cy="13.5" r="2.2" fill="#FFF4E0" />
      </svg>
    </span>
  );
}

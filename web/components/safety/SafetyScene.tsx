'use client';

// "Still Waters" — the Safety page's signature backdrop. Ported from the
// reference design (safety-scene.jsx), image-based variant: two slowly-drifting
// copies of the wave artwork, colour-graded to the app's deep navy-teal Safety
// identity, with a travelling sheen, a focal teal glow behind the command card,
// and the shared vignette/scrim framing. No canvas / rAF — pure CSS motion that
// fully stops under prefers-reduced-motion. Pinned `fixed` behind the page like
// the Status backdrop, offset past the 248px sidebar gutter; content scrolls
// over it. Pausing is handled by the parent toggling `ember-anim-paused`.

import { useAesthetic } from '@/lib/aesthetic';

// Precomputed from the reference palette (deep navy-teal, aqua accent).
const NAVY_TOP = 'rgb(7, 13, 24)';
const NAVY_LOW = 'rgb(11, 26, 46)';
const WAVE_FILTER = 'brightness(0.72) saturate(0.7) hue-rotate(-15deg) contrast(1.05)';

const layer: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

export function SafetyScene({ active = true }: { active?: boolean }) {
  const { ae } = useAesthetic();

  return (
    <div
      aria-hidden="true"
      className={`app-left-inset${active ? '' : ' ember-anim-paused'}`}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 248,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 95% 55% at 62% 104%, rgba(29, 53, 71, 0.64) 0%, transparent 58%),
          radial-gradient(ellipse 104% 50% at 50% -6%, rgba(16, 26, 37, 0.58) 0%, transparent 72%),
          linear-gradient(180deg, ${NAVY_TOP} 0%, ${NAVY_TOP} 36%, rgb(9, 20, 36) 70%, ${NAVY_LOW} 100%)
        `,
      }}
    >
      {/* Flip horizontally so the brightest wave trough sits lower-RIGHT,
          behind the gold command card (the page's focal element). */}
      <div style={{ ...layer, overflow: 'hidden', transform: 'scaleX(-1)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="sw-img-a"
          src="/safety-bg-waves.png"
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            willChange: 'transform',
            filter: WAVE_FILTER,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="sw-img-b"
          src="/safety-bg-waves.png"
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            mixBlendMode: 'screen',
            opacity: 0.42,
            willChange: 'transform, opacity',
            filter: WAVE_FILTER,
          }}
        />
        {/* Colour grade → match the app's deep base + Safety aqua-teal identity. */}
        <div style={{ ...layer, background: 'rgb(8, 12, 18)', mixBlendMode: 'multiply', opacity: 0.46 }} />
        <div style={{ ...layer, background: 'rgb(86, 196, 188)', mixBlendMode: 'color', opacity: 0.30 }} />
        <div
          style={{
            ...layer,
            background: 'radial-gradient(ellipse 80% 60% at 50% 80%, rgba(86,196,168,0.10), transparent 70%)',
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* Composition tied to the layout (unflipped): focal teal glow behind the
          command card; hero + left checklist calmed so the eye is led to the
          primary action. */}
      <div
        style={{
          ...layer,
          background: 'radial-gradient(ellipse 48% 44% at 71% 70%, rgba(120,224,206,0.17), transparent 66%)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          ...layer,
          background: `linear-gradient(180deg, rgba(7,13,24,0.64) 0%, rgba(7,13,24,0.18) 25%, transparent 46%)`,
        }}
      />
      <div style={{ ...layer, background: `linear-gradient(90deg, rgba(7,13,24,0.46) 0%, transparent 42%)` }} />

      {/* Soft left/right edge fades so strands dissolve into negative space. */}
      <div
        style={{
          ...layer,
          background: `linear-gradient(90deg, ${NAVY_TOP} 0%, transparent 16%, transparent 84%, ${NAVY_TOP} 100%)`,
          opacity: 0.85,
        }}
      />

      {/* Painterly grain (static). */}
      <svg style={{ ...layer, opacity: 0.045, mixBlendMode: 'overlay' }}>
        <filter id="sw-grain-safety">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#sw-grain-safety)" />
      </svg>

      {/* Shared framing — vignette + scrims (family resemblance + legibility). */}
      <div style={{ ...layer, background: `radial-gradient(ellipse 92% 80% at 56% 50%, transparent 32%, rgba(0,0,0,0.55) 96%)` }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 150,
          background: `linear-gradient(180deg, ${ae.bg} 0%, rgba(0,0,0,0) 100%)`,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background: `linear-gradient(0deg, ${ae.bg} 6%, rgba(0,0,0,0) 100%)`,
          opacity: 0.62,
        }}
      />
    </div>
  );
}

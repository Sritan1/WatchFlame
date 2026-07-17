'use client';

// Pure (leaflet-free) marker glyphs — the SAME visuals as the Live Map's flame
// detections and incident nuclei, but as plain React/SVG so they render OUTSIDE
// a leaflet map (the map's info/key modal). Kept leaflet-free on purpose so
// server-rendered components can import them; the L.DivIcon builders in
// ./flame-marker and ./incident-marker are the leaflet-side counterparts and
// reuse the EMBER_* path constants below.

import { type CSSProperties } from 'react';

import { getRisk, type RiskLevel } from '@/lib/theme';

export const EMBER_PATH =
  'M12 2 C 14.5 9, 20 12, 18.5 20 C 17.5 26.5, 13.5 30, 12 30 C 10.5 30, 6.5 26.5, 5.5 20 C 4 12, 9.5 9, 12 2 Z';
export const EMBER_CORE_PATH =
  'M12 12 C 13.2 15, 15 17, 14.2 21 C 13.7 24.5, 12.5 26.5, 12 26.5 C 11.5 26.5, 10.3 24.5, 9.8 21 C 9 17.5, 10.8 15, 12 12 Z';

/** The flame's colour ramp (white-hot base → red tip). The single source shared
 *  by every flame gradient — the map markers' #ember-grad (see ./flame-marker)
 *  and the legend glyph's #flame-key-grad below — so a ramp tweak can't leave
 *  them out of sync. */
export const EMBER_STOPS: readonly { offset: number; color: string }[] = [
  { offset: 0, color: '#ffffff' },
  { offset: 0.25, color: '#FFD24A' },
  { offset: 0.6, color: '#FF7A2A' },
  { offset: 1, color: '#F04438' },
];

/** The <stop> children for a vertical flame gradient. Drop inside a
 *  <linearGradient x1="0" y1="1" x2="0" y2="0">. */
export function EmberStops() {
  return (
    <>
      {EMBER_STOPS.map((s) => (
        <stop key={s.offset} offset={s.offset} stopColor={s.color} />
      ))}
    </>
  );
}

/** Satellite flame glyph as inline SVG with a self-contained gradient, for
 *  legends/keys outside a leaflet map. Uses the same `.sat-flame` styling as the
 *  real marker, so it sways and glows identically (and respects reduced-motion). */
export function FlameGlyph({ height = 26 }: { height?: number }) {
  return (
    <svg
      className="sat-flame"
      width={Math.round((height * 3) / 4)}
      height={height}
      viewBox="0 0 24 32"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flame-key-grad" x1="0" y1="1" x2="0" y2="0">
          <EmberStops />
        </linearGradient>
      </defs>
      <path d={EMBER_PATH} fill="url(#flame-key-grad)" />
      <path className="sat-core" d={EMBER_CORE_PATH} fill="#ffffff" opacity={0.85} />
    </svg>
  );
}

/** Incident nucleus glyph (severity-tinted core), for legends/keys outside a
 *  leaflet map. Uses the same `.inc-node-core` styling as the real marker. */
export function IncidentGlyph({
  severity = 'extreme',
  size = 16,
}: {
  severity?: RiskLevel;
  size?: number;
}) {
  const r = getRisk(severity);
  return (
    <div
      className="inc-node-core"
      style={{ width: size, height: size, '--sev': r.color, '--sev-rgb': r.glow } as CSSProperties}
    />
  );
}

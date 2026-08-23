'use client';

// The flame marker for satellite detections, shared by both maps. Touches leaflet
// at import, so it can only be pulled in from the client. The sway, glow and
// sparks all live in globals.css.

import L from 'leaflet';

import { EMBER_PATH, EMBER_CORE_PATH, EmberStops } from './marker-glyphs';

/** Turns a marker's key into a stable number, so every flame sways out of step
 *  with its neighbours and stays that way between renders. */
export function keyToUnit(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

/** A flame marker. Stays the same size at every zoom, sits in a box big enough to
 *  tap, and is anchored at its base so the fire rises out of the detection
 *  point. */
export function satelliteFlameIcon(
  tier: 'base' | 'bloom',
  isSelected: boolean,
  key: string,
): L.DivIcon {
  const delay = (-(keyToUnit(key) * 1.9)).toFixed(2);
  const bloom = tier === 'bloom' || isSelected ? '<div class="sat-bloom"></div>' : '';
  const embers = isSelected
    ? '<div class="sat-embers"><span></span><span></span><span></span></div>'
    : '';
  const html = `
    <div class="sat-flame-box" data-selected="${isSelected}">
      <div class="sat-flame-pos">
        ${bloom}
        <svg class="sat-flame" width="18" height="24" viewBox="0 0 24 32" style="animation-delay:${delay}s">
          <path d="${EMBER_PATH}" fill="url(#ember-grad)"></path>
          <path class="sat-core" d="${EMBER_CORE_PATH}" fill="#fff" opacity="0.85"></path>
        </svg>
        ${embers}
      </div>
    </div>`;
  return L.divIcon({
    html,
    className: 'sat-flame-wrapper',
    iconSize: [36, 46],
    iconAnchor: [18, 37],
  });
}

/** One gradient per map that every flame points at, so a hundred detections don't
 *  put a hundred identical gradients in the document. */
export function FlameGradientDef() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="ember-grad" x1="0" y1="1" x2="0" y2="0">
          <EmberStops />
        </linearGradient>
      </defs>
    </svg>
  );
}

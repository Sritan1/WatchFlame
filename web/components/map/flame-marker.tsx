'use client';

// Shared FIRMS "flame glyph" marker, used by BOTH the main Live Map (MapImpl)
// and the Fire Detail mini-map (MiniMapImpl). Both of those import leaflet and
// are already behind dynamic({ ssr: false }); this module touches leaflet at
// load, so it inherits that constraint — never import it from a server path.
//
// The flame's CSS (sway, core glow, bloom pulse, ember sparks, selected scale)
// lives in globals.css under `.sat-flame*`. Incident markers are a SEPARATE
// system (`.inc-node*`) and are untouched by anything here.

import L from 'leaflet';

import { EMBER_PATH, EMBER_CORE_PATH, EmberStops } from './marker-glyphs';

/** Stable 0..1 hash of a marker key, so each flame's sway is phase-shifted
 *  (they don't all pulse in lockstep) without the delay churning per render. */
export function keyToUnit(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

/** An ember-tip flame divIcon. `tier` 'bloom' adds the pulsing glow; `isSelected`
 *  adds rising sparks and enlarges it. Fixed pixel size (zoom-independent), sized
 *  the same on laptop and phone: a ~24px flame in a 36×46 touch box, anchored at
 *  the flame base so the fire rises FROM the detection point. */
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

/** The shared flame gradient, rendered once per map. Every flame fills its path
 *  with url(#ember-grad), so there are no duplicate gradient ids in the document
 *  regardless of how many detections are on screen. */
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

'use client';

// The named-incident marker, a tight severity-tinted nucleus, shared by the main map
// and the fire-detail mini-map. Imports leaflet at load, so client paths only. CSS is
// in globals.css. Satellite detections are a separate system, in ./flame-marker.

import L from 'leaflet';

import { getRisk, type RiskLevel } from '@/lib/theme';

/** A fixed pixel size, so the marker looks the same at every zoom and on every
 *  screen. isSelected enlarges the core. */
export function incidentNucleusIcon(severity: RiskLevel, isSelected: boolean): L.DivIcon {
  const r = getRisk(severity);
  const html = `
    <div class="inc-node-box" data-selected="${isSelected}" style="--sev:${r.color};--sev-rgb:${r.glow}">
      <div class="inc-node-core"></div>
    </div>`;
  return L.divIcon({
    html,
    className: 'inc-node-wrapper',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

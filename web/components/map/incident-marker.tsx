'use client';

// Shared named-incident marker — a tight severity-tinted nucleus (solid core).
// Used by BOTH the main Live Map (MapImpl) and the Fire Detail mini-map
// (MiniMapImpl). Imports leaflet at load, so it inherits the dynamic({ ssr:
// false }) constraint of both callers — never import it from a server path.
//
// The CSS (.inc-node*) lives in globals.css. Glow is deliberately restrained
// there (a small shadow, not a bloom) and there is no animation, so a map full
// of incidents stays smooth. Satellite flame detections are a SEPARATE system
// (see ./flame-marker).

import L from 'leaflet';

import { getRisk, type RiskLevel } from '@/lib/theme';

/** Severity-tinted nucleus divIcon. `isSelected` enlarges the core. Fixed pixel
 *  size (zoom-independent), sized the same on laptop and phone. */
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

'use client';

// Shared MapTiler/Leaflet tile config + client-side tile-health watcher, used
// by BOTH the main map (MapImpl) and the fire-detail mini-map (MiniMapImpl).
// Previously each map hand-rolled its own copy of the tile URL, attribution,
// and the tileerror/tileload outage heuristic; keeping them here means a change
// to the tile style or the outage threshold happens once and both maps agree.

import { useMemo, useRef, useState } from 'react';
import type { LeafletEventHandlerFnMap } from 'leaflet';

/** Fixed pixel height of the fire-detail mini-map. Shared so the loading
 *  placeholder and the no-key fallback can't drift from the real map (they
 *  used to be 400 while the map rendered at 220, so the panel jumped on load). */
export const MINI_MAP_HEIGHT = 220;

// Hybrid = MapTiler's satellite-with-labels style. Swap the style slug here to
// change BOTH maps at once.
export const MAPTILER_TILE_URL = (key: string) =>
  `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${key}`;

export const MAP_ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a> © ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

// Leaflet's default prefix link opens in the same tab; provide our own that
// opens in a new tab so clicking it never navigates away from the map.
export const LEAFLET_ATTRIB_PREFIX =
  '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>';

/** Watch Leaflet's tile events for a MapTiler/OSM outage that fails client-side
 *  with no backend signal. A few stray tileerrors are normal at the edges, so
 *  only flip the note after several pile up, and clear it as soon as a tile
 *  actually loads. The clear keys off the per-tile `tileload` event, NOT the
 *  batch `load` event: errored tiles fire `load` too, so on a full outage the
 *  batch `load` would immediately reset the count and hide the note.
 *
 *  Returns `showTilesNote` for the caller to render its own (size-specific) note
 *  chrome, plus the `tileEventHandlers` to spread onto the TileLayer. */
export function useTileHealth(): {
  showTilesNote: boolean;
  tileEventHandlers: LeafletEventHandlerFnMap;
} {
  const [tilesDown, setTilesDown] = useState(false);
  const tileErrorsRef = useRef(0);

  const tileEventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      tileerror: () => {
        tileErrorsRef.current += 1;
        if (tileErrorsRef.current >= 4) setTilesDown(true);
      },
      tileload: () => {
        tileErrorsRef.current = 0;
        setTilesDown(false);
      },
    }),
    [],
  );

  return {
    showTilesNote: tilesDown,
    tileEventHandlers,
  };
}

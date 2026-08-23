'use client';

// Tile config and the tile-outage watcher, shared by the main map and the
// fire-detail mini-map so their URL, attribution and outage check can't disagree.

import { useMemo, useRef, useState } from 'react';
import type { LeafletEventHandlerFnMap } from 'leaflet';

/** Height of the mini-map, shared so its placeholder and no-key fallback match and
 *  the panel doesn't jump as it loads. */
export const MINI_MAP_HEIGHT = 220;

// Hybrid is satellite with labels. Change the slug here and both maps follow.
export const MAPTILER_TILE_URL = (key: string) =>
  `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${key}`;

export const MAP_ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a> © ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

// Leaflet's own prefix link opens in the same tab and navigates away from the map.
export const LEAFLET_ATTRIB_PREFIX =
  '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>';

/** Spot a tile outage. It fails in the browser with nothing for the backend to
 *  report, and a few edge errors are normal, so wait for several. Clearing watches
 *  per-tile tileload, not the batch load, which fires even when every tile failed. */
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

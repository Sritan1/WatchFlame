'use client';

// The small map on the fire-detail screen. It doesn't pan or zoom. This screen is
// for looking at one fire, not navigating around.

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { AttributionControl, CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import type { FireFeature } from '@/lib/api';
import { FlameGradientDef, satelliteFlameIcon } from '@/components/map/flame-marker';
import { incidentNucleusIcon } from '@/components/map/incident-marker';
import { MapTilerLogo } from '@/components/ui/MapTilerLogo';
import { SourceNote } from '@/components/ui/SourceNote';
import {
  LEAFLET_ATTRIB_PREFIX,
  MAP_ATTRIBUTION,
  MAPTILER_TILE_URL,
  MINI_MAP_HEIGHT,
  useTileHealth,
} from '@/lib/map-tiles';
import type { RiskLevel } from '@/lib/theme';

/** Leaflet reads the center once, at mount, and this screen stays mounted across
 *  a fire-to-fire nav. Without this the map keeps the old framing while the
 *  markers jump off the visible tiles. */
function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);
  return null;
}

export function MiniMapImpl({
  center,
  nearby,
  maptilerKey,
  flame = false,
  mainMarkerReady = true,
  incidentSeverity = 'extreme',
}: {
  center: [number, number];
  nearby: FireFeature[];
  maptilerKey: string;
  /** A satellite detection with no incident behind it, which gets the flame. Any
   *  named incident gets the nucleus marker instead. */
  flame?: boolean;
  /** False while the incident match is still resolving. The marker is withheld
   *  until then, so it never appears as the wrong kind and swaps. */
  mainMarkerReady?: boolean;
  /** So the same fire looks the same here as on the main map. Falls back to red. */
  incidentSeverity?: RiskLevel;
}) {
  // The same tile-outage watch the main map uses.
  const { showTilesNote, tileEventHandlers } = useTileHealth();

  // Keyed on the coordinates, not the array the parent rebuilds each render, or
  // leaflet tears the marker down and restarts its animation every time.
  const [centerLat, centerLon] = center;
  const mainFlameIcon = useMemo(
    () => (flame ? satelliteFlameIcon('bloom', true, `${centerLat},${centerLon}`) : null),
    [flame, centerLat, centerLon],
  );
  // The other kind of marker, enlarged because it's the subject of the screen.
  const incidentIcon = useMemo(
    () => (flame ? null : incidentNucleusIcon(incidentSeverity, true)),
    [flame, incidentSeverity],
  );

  return (
    <div className="app-minimap" style={{ position: 'relative', width: '100%', height: MINI_MAP_HEIGHT, isolation: 'isolate' }}>
    {flame ? <FlameGradientDef /> : null}
    <MapContainer
      center={center}
      zoom={9}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      dragging={false}
      keyboard={false}
      touchZoom={false}
      attributionControl={false}
      style={{ width: '100%', height: MINI_MAP_HEIGHT, background: '#0B0E12' }}
    >
      <Recenter lat={center[0]} lon={center[1]} />
      <AttributionControl prefix={LEAFLET_ATTRIB_PREFIX} />
      <TileLayer
        url={MAPTILER_TILE_URL(maptilerKey)}
        attribution={MAP_ATTRIBUTION}
        eventHandlers={tileEventHandlers}
      />

      {/* Surrounding cluster, small high-severity dots, capped at 50 */}
      {nearby.slice(0, 50).map((f, i) => (
        <CircleMarker
          key={`mini-${i}-${f.properties.lat},${f.properties.lon}`}
          center={[f.properties.lat, f.properties.lon]}
          radius={4}
          pathOptions={{
            color: '#fff',
            weight: 1,
            fillColor: '#f97316',
            fillOpacity: 0.9,
            opacity: 1,
          }}
          interactive={false}
        />
      ))}

      {/* Held back until the marker kind is known, so it never draws the wrong one
          first. Neither is clickable. */}
      {!mainMarkerReady ? null : flame && mainFlameIcon ? (
        <Marker position={center} icon={mainFlameIcon} interactive={false} />
      ) : incidentIcon ? (
        <Marker position={center} icon={incidentIcon} interactive={false} />
      ) : null}
    </MapContainer>
      <MapTilerLogo />
      {showTilesNote ? (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '7px 12px',
            borderRadius: 9,
            background: 'rgba(13, 16, 18, 0.85)',
            border: '0.5px solid rgba(232, 179, 57, 0.30)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            pointerEvents: 'none',
          }}
        >
          <SourceNote text="Map tiles failed to load" />
        </div>
      ) : null}
    </div>
  );
}

// Re-exported so the screen can lazy-import this without touching leaflet types.
export type { FireFeature };

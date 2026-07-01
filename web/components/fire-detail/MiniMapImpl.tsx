'use client';

// Non-interactive mini-map for the Fire Detail screen. Mirrors the embedded
// MapView in mobile app/fire-detail.tsx — one bright fire marker + a cluster
// of smaller FIRMS dots from the surrounding 8 mi / 7 days. No pan/zoom; the
// screen is for inspection, not navigation.

import 'leaflet/dist/leaflet.css';
import { useRef, useState } from 'react';
import { AttributionControl, CircleMarker, MapContainer, TileLayer } from 'react-leaflet';

import type { FireFeature } from '@/lib/api';
import { MapTilerLogo } from '@/components/ui/MapTilerLogo';
import { SourceNote } from '@/components/ui/SourceNote';
import { useSourceHealth } from '@/lib/source-health';

const TILE_URL = (key: string) =>
  `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${key}`;

const ATTRIB =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a> © ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const LEAFLET_PREFIX =
  '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>';

export function MiniMapImpl({
  center,
  nearby,
  maptilerKey,
}: {
  center: [number, number];
  nearby: FireFeature[];
  maptilerKey: string;
}) {
  // Same tile-health watch as the main MapImpl: a MapTiler/OSM outage fails
  // client-side with no backend signal, so flip a note after a few tileerrors
  // and clear it once a tile set loads. health.maptiler is the dev `?health=`
  // override so the note is testable here too.
  const [tilesDown, setTilesDown] = useState(false);
  const tileErrorsRef = useRef(0);
  const health = useSourceHealth();
  const showTilesNote = tilesDown || health.maptiler === 'down';

  return (
    <div className="app-minimap" style={{ position: 'relative', width: '100%', height: 220 }}>
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
      style={{ width: '100%', height: 220, background: '#0B0E12' }}
    >
      <AttributionControl prefix={LEAFLET_PREFIX} />
      <TileLayer
        url={TILE_URL(maptilerKey)}
        attribution={ATTRIB}
        eventHandlers={{
          tileerror: () => {
            tileErrorsRef.current += 1;
            if (tileErrorsRef.current >= 4) setTilesDown(true);
          },
          load: () => {
            tileErrorsRef.current = 0;
            setTilesDown(false);
          },
        }}
      />

      {/* Surrounding cluster — small high-severity dots, capped at 50 */}
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

      {/* Main fire — divIcon so we can match mobile's white-ringed extreme dot */}
      <CircleMarker
        center={center}
        radius={9}
        pathOptions={{
          color: '#fff',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 1,
          opacity: 1,
        }}
        interactive={false}
      />
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

// Re-export so the screen can dynamic-import without inspecting leaflet types.
export type { FireFeature };

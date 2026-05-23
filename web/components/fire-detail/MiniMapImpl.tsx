'use client';

// Non-interactive mini-map for the Fire Detail screen. Mirrors the embedded
// MapView in mobile app/fire-detail.tsx — one bright fire marker + a cluster
// of smaller FIRMS dots from the surrounding 8 mi / 7 days. No pan/zoom; the
// screen is for inspection, not navigation.

import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';

import type { FireFeature } from '@/lib/api';

const TILE_URL = (key: string) =>
  `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${key}`;

const ATTRIB =
  '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © ' +
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function MiniMapImpl({
  center,
  nearby,
  maptilerKey,
}: {
  center: [number, number];
  nearby: FireFeature[];
  maptilerKey: string;
}) {
  return (
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
      <TileLayer url={TILE_URL(maptilerKey)} attribution={ATTRIB} />

      {/* Surrounding cluster — small high-severity dots, capped at 50 */}
      {nearby.slice(0, 50).map((f, i) => (
        <CircleMarker
          // eslint-disable-next-line react/no-array-index-key
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
  );
}

// Re-export so the screen can dynamic-import without inspecting leaflet types.
export type { FireFeature };

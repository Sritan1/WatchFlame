'use client';

// Non-interactive mini-map for the Fire Detail screen. Mirrors the embedded
// MapView in mobile app/fire-detail.tsx — one bright fire marker + a cluster
// of smaller FIRMS dots from the surrounding 8 mi / 7 days. No pan/zoom; the
// screen is for inspection, not navigation.

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

/** react-leaflet's MapContainer only applies `center`/`zoom` on mount. The
 *  fire-detail screen stays mounted across client navigation between two fires,
 *  so without this the basemap would stay framed on the previous fire while the
 *  markers jumped to the new coordinates (off the visible tiles). Recenter on
 *  the primitive lat/lon so it only pans when they actually change. */
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
  /** True when this detail is a satellite-only detection (a FIRMS pixel with no
   *  matched named incident). The main marker then becomes the flame glyph —
   *  the hero (bloom + sparks) variant. A named incident, or a pixel that also
   *  matches one ("both"), gets the incident nucleus marker instead. */
  flame?: boolean;
  /** Whether we yet KNOW which main marker to show. False while the incident
   *  match is still resolving for a satellite detection — the main marker is
   *  withheld until then, so it never appears as the wrong kind and swaps. The
   *  surrounding cluster + tiles still render. Non-FIRMS pages pass true (the
   *  incident marker is known up front). */
  mainMarkerReady?: boolean;
  /** Severity tint for the incident nucleus (the non-flame main marker), so it
   *  matches how the same incident is coloured on the Live Map. Defaults to the
   *  red "extreme" tone, which also fits the fire-detail screen's red identity. */
  incidentSeverity?: RiskLevel;
}) {
  // Same tile-health watch as the main MapImpl (shared hook).
  const { showTilesNote, tileEventHandlers } = useTileHealth();

  // One hero flame for the fire being inspected. Only built when `flame` is on.
  // Keyed on the primitive lat/lon (not the `center` array, which the parent
  // recreates each render) so the icon identity stays stable — otherwise a new
  // icon every render would recreate the marker DOM and restart the animation.
  const [centerLat, centerLon] = center;
  const mainFlameIcon = useMemo(
    () => (flame ? satelliteFlameIcon('bloom', true, `${centerLat},${centerLon}`) : null),
    [flame, centerLat, centerLon],
  );
  // The non-flame main marker: the same incident nucleus used on the Live Map,
  // as the hero (enlarged) variant since it's the focus of the screen. Skipped
  // for a satellite-only detail, where the flame is shown instead.
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

      {/* Main fire. Withheld until `mainMarkerReady` so it never shows the wrong
       *  kind first. A satellite-only detection then gets the flame glyph (hero
       *  bloom + sparks); a named incident (or a pixel matching one) gets the
       *  incident nucleus marker. Both are non-interactive — this map is for
       *  inspection, not clicking. */}
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

// Re-export so the screen can dynamic-import without inspecting leaflet types.
export type { FireFeature };

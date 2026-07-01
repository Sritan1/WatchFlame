'use client';

// Leaflet + MapTiler — must stay behind `next/dynamic({ ssr: false })` because
// leaflet touches `window` at module load. The screen orchestrator (MapScreen)
// is the only place that should import this.

import L, { type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, CircleMarker, Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import type { FireFeature, NamedIncident } from '@/lib/api';
import { MapTilerLogo } from '@/components/ui/MapTilerLogo';
import { SourceNote } from '@/components/ui/SourceNote';
import { useSourceHealth } from '@/lib/source-health';
import { getRisk, hexToRgb, type RiskLevel } from '@/lib/theme';

/** Two-kind selection: named-incident from NIFC/Cal Fire OR a single
 *  FIRMS satellite hot-pixel. Mirrors mobile's `SelectedItem` discriminator. */
export type MapSelection =
  | { kind: 'incident'; id: string }
  | { kind: 'fire'; feature: FireFeature };

// Mobile uses MIN_INCIDENT_RADIUS_M = 500 so small fires stay clickable; we
// match that here so the visual reads identically.
const MIN_INCIDENT_RADIUS_M = 500;
const DEFAULT_INCIDENT_ACRES = 100;

/** Convert acres → circle radius in meters. Same formula as
 *  app/lib/geo.ts's acresToRadiusMeters: r = sqrt(area / π). */
function acresToRadiusMeters(acres: number): number {
  const sqMeters = Math.max(0, acres) * 4046.86; // acres → m²
  return Math.sqrt(sqMeters / Math.PI);
}

function incidentRadiusM(inc: NamedIncident): number {
  return Math.max(
    acresToRadiusMeters(inc.acres ?? DEFAULT_INCIDENT_ACRES),
    MIN_INCIDENT_RADIUS_M,
  );
}

// Streets-v2 is MapTiler's most Google-Maps-like style — bright base, colored
// road hierarchy, full POI labeling. Swap to `voyager` for a softer
// near-white palette or `streets-v2-dark` to revert to a dark theme.
const TILE_URL = (key: string) =>
  `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${key}`;
const ATTRIB =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a> © ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
// Leaflet's default prefix link opens in the same tab; provide our own that
// opens in a new tab so clicking it never navigates away from the map.
const LEAFLET_PREFIX =
  '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>';

function fireIcon(severity: RiskLevel, isSelected: boolean): L.DivIcon {
  // The reference's marker is a colored core with optional outer pulse rings.
  // We render the same with two stacked absolute divs; CSS for `.fire-marker`
  // is in globals.css so animations + glow can use keyframes.
  const r = getRisk(severity);
  const isAlarming = severity === 'extreme' || severity === 'high';
  const coreSize = isSelected ? 22 : 18;
  const html = `
    <div class="fire-marker" data-selected="${isSelected}" data-alarming="${isAlarming}">
      ${isAlarming ? `<div class="fire-marker__pulse" style="background:${r.color};animation-delay:0s"></div>` : ''}
      ${isAlarming ? `<div class="fire-marker__pulse" style="background:${r.color};animation-delay:1s"></div>` : ''}
      <div class="fire-marker__core" style="
        width:${coreSize}px;height:${coreSize}px;
        background:radial-gradient(circle at 30% 30%, #fff, ${r.color} 60%);
        box-shadow: 0 0 22px ${r.color}, 0 0 6px #fff;
        border:${isSelected ? 2 : 1.5}px solid rgba(255,255,255,0.6);
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'fire-marker-wrapper',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function userIcon(): L.DivIcon {
  const html = `
    <div class="user-marker">
      <div class="user-marker__pulse"></div>
      <div class="user-marker__core"></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'user-marker-wrapper',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/** Imperative camera helper — pans/zooms when the selection OR the user's
 *  watched-location center changes. The key folds `center` in for the
 *  no-selection branch so switching saved locations actually flies the map;
 *  previously the key was just `null` for "nothing selected" and a center
 *  change went unnoticed. */
function CameraController({
  center,
  selection,
  fires,
}: {
  center: [number, number];
  selection: MapSelection | null;
  fires: NamedIncident[];
}) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);

  const key = selection
    ? selection.kind === 'incident'
      ? `incident:${selection.id}`
      : `fire:${selection.feature.properties.lat},${selection.feature.properties.lon}`
    : `center:${center[0].toFixed(4)},${center[1].toFixed(4)}`;

  useEffect(() => {
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    if (!selection) {
      map.flyTo(center, 8, { duration: 0.6 });
      return;
    }
    if (selection.kind === 'incident') {
      const fire = fires.find((f) => f.id === selection.id);
      if (!fire) return;
      map.flyTo([fire.lat, fire.lon], 12, { duration: 0.6 });
    } else {
      const { lat, lon } = selection.feature.properties;
      map.flyTo([lat, lon], 13, { duration: 0.6 });
    }
  }, [key, selection, fires, center, map]);

  return null;
}

export function MapImpl({
  center,
  fires,
  satellites,
  severityOf,
  selection,
  onSelect,
  maptilerKey,
}: {
  center: [number, number];
  /** Named (tracked) incidents from NIFC + Cal Fire. */
  fires: NamedIncident[];
  /** Satellite hot-pixel detections from NASA FIRMS. Rendered as small red
   *  dots (CircleMarker — pixel-sized regardless of zoom). */
  satellites: FireFeature[];
  severityOf: (f: NamedIncident) => RiskLevel;
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  maptilerKey: string;
}) {
  // Memoize icons so leaflet doesn't recreate DOM on every render.
  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const f of fires) {
      const sev = severityOf(f);
      map.set(`${f.id}:false`, fireIcon(sev, false));
      map.set(`${f.id}:true`, fireIcon(sev, true));
    }
    return map;
  }, [fires, severityOf]);

  const userMarker = useMemo(() => userIcon(), []);

  const selectedIncidentId = selection?.kind === 'incident' ? selection.id : null;
  const selectedSatKey = selection?.kind === 'fire'
    ? `${selection.feature.properties.lat.toFixed(5)},${selection.feature.properties.lon.toFixed(5)}`
    : null;
  const selectedFire = selectedIncidentId ? fires.find((f) => f.id === selectedIncidentId) : null;
  const selectedSeverity = selectedFire ? severityOf(selectedFire) : null;

  const mapRef = useRef<LeafletMap | null>(null);

  // Tile-load health. MapTiler/OSM tiles fail client-side (quota, key, network)
  // with no backend signal, so we watch Leaflet's tile events directly. A few
  // stray tileerrors are normal at the edges, so only flip the note after
  // several pile up, and clear it the moment a visible tile set finishes
  // loading. Without this, a tile outage leaves a silent gray map.
  const [tilesDown, setTilesDown] = useState(false);
  const tileErrorsRef = useRef(0);
  // health.maptiler is only ever set by the dev `?health=` override (the
  // backend has no tile-health signal), so it lets the tile note be tested
  // without an actual tile outage.
  const health = useSourceHealth();
  const showTilesNote = tilesDown || health.maptiler === 'down';

  // Expose imperative zoom controls via global event so the floating buttons
  // (which sit outside MapContainer's tree) can call into the map.
  useEffect(() => {
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<{ delta: number }>).detail;
      mapRef.current?.zoomIn(detail.delta);
    };
    window.addEventListener('ember-map-zoom', onZoom);
    return () => window.removeEventListener('ember-map-zoom', onZoom);
  }, []);

  // Broadcast current center + zoom whenever they change. MapScreen reads
  // this to draw the scale bar (which depends on latitude + zoom). The first
  // emit runs once on mount so the bar isn't blank before the first move.

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <MapContainer
      ref={mapRef}
      center={center}
      // Zoom 8 ~ regional view (~150 mi diameter) — matches mobile's
      // latitudeDelta=4 initial framing so the user lands seeing the same
      // neighborhood-cluster context, not a city-level crop.
      zoom={8}
      zoomControl={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%', background: '#0B0E12' }}
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

      <Marker position={center} icon={userMarker} />

      {/* Render order (bottom → top within the SVG pane):
       *   1. Incident perimeter circles (largest, lowest priority)
       *   2. Dashed selection halo
       *   3. Satellite hot-pixels (small but on top so they stay clickable
       *      even when inside an incident circle — mobile-equivalent UX)
       *   4. Incident divIcon markers (markerPane — always on top)
       *
       *  Within a leaflet pane, later JSX renders are visually + click-priority
       *  higher. So we render incident Circles first, then satellites on top. */}

      {fires.map((f) => {
        const sev = severityOf(f);
        const color = getRisk(sev).color;
        const isSel = selectedIncidentId === f.id;
        return (
          <Circle
            key={`circle-${f.id}`}
            center={[f.lat, f.lon]}
            radius={incidentRadiusM(f)}
            pathOptions={{
              color,
              weight: isSel ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: isSel ? 0.20 : 0.12,
              opacity: 0.85,
            }}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'incident', id: f.id }),
            }}
          />
        );
      })}

      {/* Dashed selection halo around the active incident */}
      {selectedFire && selectedSeverity ? (
        <Circle
          center={[selectedFire.lat, selectedFire.lon]}
          radius={Math.max(incidentRadiusM(selectedFire) * 1.4, 1200)}
          pathOptions={{
            color: getRisk(selectedSeverity).color,
            weight: 1,
            fillOpacity: 0,
            dashArray: '4 6',
          }}
        />
      ) : null}

      {/* FIRMS satellite hot-pixel detections — rendered AFTER incident
       *  circles so they sit on top and remain clickable through the larger
       *  circles. Each ~375m thermal anomaly from Suomi NPP / NOAA-20 / Aqua
       *  / Terra in the last 24h. Brightness drives radius (6-12px — bumped
       *  from 4-8 so the hit target is reliable). */}
      {satellites.map((s, i) => {
        const lat = s.properties.lat;
        const lon = s.properties.lon;
        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        const bright = s.properties.brightness ?? 320;
        // Brightness 300-400K → radius 6-12 px. Mobile uses ~8px markers
        // for the same FIRMS dots so this matches the visual weight.
        const radius = 6 + Math.min(6, Math.max(0, (bright - 300) / 16));
        const isSel = selectedSatKey === key;
        return (
          <CircleMarker
            key={`firms-${i}-${key}`}
            center={[lat, lon]}
            radius={isSel ? radius + 2 : radius}
            pathOptions={{
              color: isSel ? '#fff' : '#ff7a3a',
              weight: isSel ? 1.5 : 1,
              fillColor: '#ff5a2a',
              fillOpacity: 0.85,
              opacity: 1,
            }}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'fire', feature: s }),
            }}
          />
        );
      })}

      {fires.map((f) => {
        const isSel = selectedIncidentId === f.id;
        const icon = icons.get(`${f.id}:${isSel}`) ?? icons.get(`${f.id}:false`);
        if (!icon) return null;
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lon]}
            icon={icon}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'incident', id: f.id }),
            }}
          />
        );
      })}

      <CameraController center={center} selection={selection} fires={fires} />
      <ZoomBroadcaster />
    </MapContainer>
      <MapTilerLogo />
      {showTilesNote ? (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '8px 13px',
            borderRadius: 10,
            background: 'rgba(13, 16, 18, 0.82)',
            border: '0.5px solid rgba(232, 179, 57, 0.30)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            pointerEvents: 'none',
          }}
        >
          <SourceNote text="Map tiles failed to load" />
        </div>
      ) : null}
    </div>
  );
}

/** Watches the leaflet map and dispatches `ember-map-state` whenever the
 *  center or zoom changes. Used by MapScreen's floating scale bar. */
function ZoomBroadcaster() {
  const map = useMap();
  useEffect(() => {
    const emit = () => {
      const c = map.getCenter();
      window.dispatchEvent(
        new CustomEvent('ember-map-state', {
          detail: { lat: c.lat, zoom: map.getZoom() },
        }),
      );
    };
    map.on('zoomend', emit);
    map.on('moveend', emit);
    emit();
    return () => {
      map.off('zoomend', emit);
      map.off('moveend', emit);
    };
  }, [map]);
  return null;
}

// Re-export for type narrowing convenience
export type { NamedIncident };
export { hexToRgb };

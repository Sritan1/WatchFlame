'use client';

// 380px right rail: header (with explainer info icon + "Live" pill) +
// scrolling list of premium incident cards + kind-aware detail card in the
// footer. Selection can be either a named incident (NIFC/Cal Fire) OR a
// FIRMS satellite hot-pixel — the footer renders the appropriate fields per
// kind, with a "Limited data" callout for incidents missing acres/containment.
//
// Visual: premium glass aesthetic ported from web-map.jsx — left hairline
// + inner shadow so the rail reads overlaid on the map; ambient accent glow
// when a fire is selected; cards with severity bar, cursor-following shine,
// hover lift, and shimmer pip on urgent chips. NO containment progress bar
// inside cards (per design spec).

import Link from 'next/link';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { FireFieldsExplainerModal } from '@/components/map/FireFieldsExplainerModal';
import type { MapSelection } from '@/components/map/MapImpl';
import { cardinal8 } from '@/components/ui/CompassRose';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { FireFeature, LatLon, NamedIncident } from '@/lib/api';
import { bearingTo, distanceMiles, firmsAgeHours } from '@/lib/composite-risk';
import { confidenceLabel, firmsDetailHref, satelliteTitle } from '@/lib/firms';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { firmsNote, incidentFeedNote, useSourceHealth } from '@/lib/source-health';
import { formatDistance, useUnits } from '@/lib/use-units';

/** Which feed the rail list is showing. Both are co-equal citizens now:
 *  'incidents' = named NIFC/Cal Fire incidents, 'hotspots' = FIRMS satellite
 *  detections (previously map-click-only). */
export type RailTab = 'incidents' | 'hotspots';

export function IncidentsRail({
  fires,
  satellites,
  selection,
  onSelect,
  locationLabel,
  severityOf,
  isLoading = false,
  satellitesLoading = false,
  incidentsError = false,
  satellitesError = false,
  onRetry,
  tab,
  onTabChange,
  userCoords,
  radiusMi = 30,
  incidentsUpdatedAt,
  satellitesUpdatedAt,
}: {
  fires: NamedIncident[];
  /** FIRMS satellite hot-pixels in view (already capped + shown on the map).
   *  Now also rendered as browsable cards under the Hotspots tab. */
  satellites: FireFeature[];
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  locationLabel: string;
  severityOf: (f: NamedIncident) => RiskLevel;
  isLoading?: boolean;
  /** The FIRMS satellite feed is still loading (drives the Hotspots tab's
   *  skeletons + count placeholder). */
  satellitesLoading?: boolean;
  /** The named-incident feed (NIFC/Cal Fire) failed to load. */
  incidentsError?: boolean;
  /** The FIRMS satellite feed failed to load. Independent of incidentsError:
   *  the two are separate feeds, so one failing still shows the other. */
  satellitesError?: boolean;
  onRetry?: () => void;
  /** Active feed tab. Lifted to MapScreen so a map selection can surface the
   *  matching tab. */
  tab: RailTab;
  onTabChange: (t: RailTab) => void;
  /** User's current focus point — needed to compute distance to satellite
   *  hits (named incidents carry their own distance). */
  userCoords: LatLon;
  /** Search radius shown in the subtitle ("Within N mi of …"). */
  radiusMi?: number;
  /** When each feed last successfully fetched (epoch ms from the query's
   *  dataUpdatedAt). Shown as "Checked HH:MM" on the empty-state panel. */
  incidentsUpdatedAt?: number;
  satellitesUpdatedAt?: number;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const selectedIncidentId = selection?.kind === 'incident' ? selection.id : null;
  const selected = selectedIncidentId ? fires.find((f) => f.id === selectedIncidentId) ?? null : null;
  const selectedSev = selected ? severityOf(selected) : null;
  const selectedRisk = selectedSev ? getRisk(selectedSev, accent) : null;
  const selectedSatKey = selection?.kind === 'fire' ? satKey(selection.feature) : null;
  const [explainerOpen, setExplainerOpen] = useState(false);

  // Hotspot list — same capped set the map shows, but ordered by distance
  // (most useful for a list; the map orders by brightness). Same members, so
  // every dot on the map still has a corresponding card here.
  const satList = useMemo(
    () =>
      [...satellites].sort(
        (a, b) =>
          distanceMiles(userCoords, { lat: a.properties.lat, lon: a.properties.lon }) -
          distanceMiles(userCoords, { lat: b.properties.lat, lon: b.properties.lon }),
      ),
    [satellites, userCoords],
  );

  // Per-source health from the X-Source-Health header. Lets the rail tell a
  // real feed outage apart from a genuinely-empty result — so a FIRMS outage
  // reads as "Satellite feed down" instead of a misleading "no detections",
  // and a single-feed incident outage names which one dropped.
  const health = useSourceHealth();
  const firmsDown = firmsNote(health) !== null;
  const incidentsFullyDown = health.nifc === 'down' && health.calfire === 'down';

  // Source-aware subtitle — always describes the ACTIVE feed honestly, so
  // "0 reported" reads in context next to the satellite hotspots that ARE on
  // the map (the old single "No active incidents within range" was the bug).
  const railSubtitle = (() => {
    if (tab === 'incidents') {
      if (incidentsError) return 'Incident feed unavailable';
      const note = incidentFeedNote(health);
      if (note) return note;
      if (isLoading && fires.length === 0) return 'Loading incidents…';
      if (fires.length === 0) return 'No active incidents reported within range';
      return `Within ${formatDistance(radiusMi, units.distance, 0)} of ${locationLabel} · sorted by distance`;
    }
    if (satellitesError) return 'Satellite feed unavailable';
    const note = firmsNote(health);
    if (note) return note;
    if (satellitesLoading && satellites.length === 0) return 'Loading detections…';
    if (satellites.length === 0) return 'No satellite detections within range';
    return 'NASA FIRMS · last 24h · may include controlled burns';
  })();

  // Auto-scroll the selected card into view inside the rail — for either feed.
  // Fires on selection OR tab change (so when a map-click flips the tab, the
  // just-revealed card scrolls into focus). `block: 'nearest'` makes it a
  // no-op when the card is already visible.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let sel: string | null = null;
    if (selection?.kind === 'incident') {
      sel = `[data-incident-id="${CSS.escape(selection.id)}"]`;
    } else if (selection?.kind === 'fire') {
      sel = `[data-sat-key="${CSS.escape(satKey(selection.feature))}"]`;
    }
    if (!sel) return;
    const el = container.querySelector<HTMLElement>(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selection, tab]);

  return (
    <aside
      style={{
        position: 'relative',
        background: `linear-gradient(180deg, ${ae.surface} 0%, ${ae.bg} 22%, ${ae.bg} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {/* Left edge hairline — makes the rail feel overlaid on the map */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 1,
          background: `linear-gradient(180deg, rgba(255,255,255,0.10), ${ae.lineStrong} 12%, ${ae.line} 50%, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* Soft inner shadow at the left edge */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 40,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.45), transparent)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Ambient accent glow tinted to the selected fire's severity */}
      {selectedRisk ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -120,
            right: -100,
            width: 360,
            height: 360,
            background: `radial-gradient(circle, rgba(${selectedRisk.glow}, 0.18), transparent 65%)`,
            filter: 'blur(36px)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 0.45s ease',
          }}
        />
      ) : null}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '22px 22px 18px',
          borderBottom: `0.5px solid ${ae.line}`,
          background: `linear-gradient(180deg, ${ae.surface}, transparent)`,
        }}
      >
        {/* Top hairline highlight */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 22,
            right: 22,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                background: ae.textDim,
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: ae.textMute,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Fire Activity
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Live pill */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 9px 4px 8px',
                borderRadius: 999,
                background: 'rgba(63, 182, 139, 0.10)',
                border: '0.5px solid rgba(63, 182, 139, 0.30)',
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 700,
                color: '#3FB68B',
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              <span
                className="inc-live-dot"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: '#3FB68B',
                  boxShadow: '0 0 8px #3FB68B',
                }}
              />
              Live
            </span>

            {/* Explainer info button — preserved */}
            <button
              type="button"
              onClick={() => setExplainerOpen(true)}
              aria-label="About these fields"
              style={{
                width: 22,
                height: 22,
                borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.04)',
                border: `0.5px solid ${ae.line}`,
                color: ae.textMute,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Dual-feed segmented control. Replaces the old single "N fires in
            region" headline that hid the satellite layer entirely and made a
            bare "0" read as "nothing here" even with the map full of FIRMS
            dots. Both feeds are now co-equal, browsable, and counted. */}
        <RailTabs
          tab={tab}
          onTabChange={onTabChange}
          incidentCount={fires.length}
          satelliteCount={satellites.length}
          incidentsLoading={isLoading && fires.length === 0}
          satellitesLoading={satellitesLoading && satellites.length === 0}
          incidentsError={incidentsError || incidentsFullyDown}
          satellitesError={satellitesError || firmsDown}
        />

        {/* Source-aware subtitle for the active feed. */}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            color: ae.textDim,
            letterSpacing: '0.06em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={ae.textMute}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{ flexShrink: 0 }}
          >
            <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span style={{ minWidth: 0 }}>{railSubtitle}</span>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="inc-rail-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 22px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {tab === 'incidents' ? (
          <>
            {incidentsError ? (
              <DataErrorState
                compact
                title="Incident feed unavailable"
                message="Couldn't load NIFC and Cal Fire incidents. Satellite detections (if any) still show on the map and the Satellite detections tab. Try again."
                onRetry={onRetry}
              />
            ) : null}
            {!incidentsError && isLoading && fires.length === 0 ? <SkeletonCards /> : null}
            {!incidentsError && !isLoading && fires.length === 0 && !incidentsFullyDown ? (
              <EmptyFeedPanel
                kind="incidents"
                locationLabel={locationLabel}
                radiusLabel={formatDistance(radiusMi, units.distance, 0)}
                syncedAt={incidentsUpdatedAt}
                siblingCount={satellites.length}
                onViewSibling={() => onTabChange('hotspots')}
              />
            ) : null}
            {fires.map((f, i) => {
              const sev = severityOf(f);
              const fr = getRisk(sev, accent);
              const isSel = selectedIncidentId === f.id;
              const isUrgent = sev === 'extreme' || sev === 'high';
              return (
                <IncidentCard
                  key={f.id}
                  fire={f}
                  risk={fr}
                  severity={sev}
                  index={i}
                  isSelected={isSel}
                  isUrgent={isUrgent}
                  distanceUnit={units.distance}
                  onClick={() => onSelect(isSel ? null : { kind: 'incident', id: f.id })}
                />
              );
            })}
          </>
        ) : (
          <>
            {satellitesError ? (
              <DataErrorState
                compact
                title="Satellite feed unavailable"
                message="Couldn't load NASA FIRMS detections. Named incidents (if any) still show on the Active incidents reported tab. Try again."
                onRetry={onRetry}
              />
            ) : null}
            {!satellitesError && satellitesLoading && satellites.length === 0 ? (
              <SkeletonCards />
            ) : null}
            {!satellitesError && !satellitesLoading && satellites.length === 0 && !firmsDown ? (
              <EmptyFeedPanel
                kind="satellite"
                locationLabel={locationLabel}
                radiusLabel={formatDistance(radiusMi, units.distance, 0)}
                syncedAt={satellitesUpdatedAt}
                siblingCount={fires.length}
                onViewSibling={() => onTabChange('incidents')}
              />
            ) : null}
            {satList.map((s, i) => {
              const key = satKey(s);
              const isSel = selectedSatKey === key;
              const coords = { lat: s.properties.lat, lon: s.properties.lon };
              return (
                <SatelliteCard
                  key={key}
                  feature={s}
                  index={i}
                  isSelected={isSel}
                  distanceMi={distanceMiles(userCoords, coords)}
                  directionLabel={cardinal8(bearingTo(userCoords, coords))}
                  distanceUnit={units.distance}
                  onClick={() => onSelect(isSel ? null : { kind: 'fire', feature: s })}
                />
              );
            })}
          </>
        )}
      </div>

      {/* ── Kind-aware detail footer ───────────────────────────────────
       *  Minimal "Selected" rail per the design spec — dot + label + name
       *  + distance + "Open Incident Report" CTA. The verbose detail card
       *  (3-stat grid, Limited-data callout, close X) is removed because
       *  the same data already lives in the card list above, and clicking
       *  the selected card / marker a second time unselects it. */}
      {selection?.kind === 'incident' && selected && selectedRisk ? (
        <DetailFooter
          label="Selected"
          name={selected.name}
          distanceLabel={formatDistance(selected.distance_mi, units.distance, 1)}
          accentColor={selectedRisk.color}
          accentGlow={selectedRisk.glow}
          detailHref={`/fire-detail?lat=${selected.lat}&lon=${selected.lon}`}
        />
      ) : null}
      {selection?.kind === 'fire' ? (
        <DetailFooter
          label="Selected"
          name={satelliteTitle(selection.feature.properties.satellite)}
          distanceLabel={formatDistance(
            distanceMiles(userCoords, {
              lat: selection.feature.properties.lat,
              lon: selection.feature.properties.lon,
            }),
            units.distance,
            1,
          )}
          accentColor="#ff7a3a"
          accentGlow="255, 122, 58"
          detailHref={firmsDetailHref(selection.feature)}
          stats={buildSatelliteStats(selection.feature)}
        />
      ) : null}

      <FireFieldsExplainerModal open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </aside>
  );
}

/** Three at-a-glance stats for a FIRMS satellite pixel, formatted for the
 *  rail's detail footer. Mirrors the IncidentCard's Dist/Size/Cont strip so
 *  the satellite footer reads with the same rhythm as a named-incident
 *  footer — gives the user something concrete before they click through. */
function buildSatelliteStats(feature: FireFeature): FooterStat[] {
  const p = feature.properties;
  return [
    {
      label: 'Bright',
      value: p.brightness != null ? Math.round(p.brightness).toString() : '—',
      unit: p.brightness != null ? 'K' : undefined,
    },
    {
      label: 'Conf',
      value: confidenceLabel(p.confidence),
    },
    {
      label: 'Detected',
      value: firmsAgeShort(firmsAgeHours(p.acq_date, p.acq_time)),
    },
  ];
}

/** FIRMS confidence is reported either as one of L/N/H (MODIS) or a 0-100
 *  integer (VIIRS). Normalize both to a short word; "—" when missing. */
/** Compact "20m" / "3h" / "2d" formatter for the footer stats strip — short
 *  enough to fit alongside Brightness + Confidence without wrapping. */
function firmsAgeShort(ageHr: number | null): string {
  if (ageHr == null) return '—';
  if (ageHr < 1) return `${Math.max(1, Math.round(ageHr * 60))}m`;
  if (ageHr < 24) return `${Math.round(ageHr)}h`;
  return `${Math.round(ageHr / 24)}d`;
}

// ─── Incident Card ────────────────────────────────────────────────────────

function IncidentCardImpl({
  fire,
  risk,
  severity,
  index,
  isSelected,
  isUrgent,
  distanceUnit,
  onClick,
}: {
  fire: NamedIncident;
  risk: { color: string; glow: string; label: string };
  severity: RiskLevel;
  index: number;
  isSelected: boolean;
  isUrgent: boolean;
  distanceUnit: 'mi' | 'km';
  onClick: () => void;
}) {
  const { ae } = useAesthetic();

  // Cursor-following highlight — sets CSS vars used by .inc-card-shine.
  // getBoundingClientRect() forces a synchronous layout flush, so we cache
  // it on mouseEnter (and refresh per-card on each hover entry) instead of
  // paying the cost on every one of the ~60 mousemove events/sec.
  const rectRef = useRef<DOMRect | null>(null);
  const onEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    rectRef.current = e.currentTarget.getBoundingClientRect();
  };
  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = rectRef.current ?? e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const distLabel = formatDistance(fire.distance_mi, distanceUnit, 1);
  const sizeLabel =
    fire.acres != null ? fire.acres.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const contLabel = fire.contained_pct != null ? `${Math.round(fire.contained_pct)}` : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      data-selected={isSelected ? 'true' : 'false'}
      data-incident-id={fire.id}
      className={`inc-card${isSelected ? ' inc-card-sel' : ''}`}
      style={{
        ['--ic-color' as string]: risk.color,
        ['--ic-glow' as string]: risk.glow,
        width: '100%',
        padding: '14px 16px 14px 18px',
        marginBottom: 8,
        textAlign: 'left',
        position: 'relative',
        background: isSelected
          ? `linear-gradient(180deg, rgba(${risk.glow}, 0.12), rgba(${risk.glow}, 0.04) 60%, ${ae.surface})`
          : `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
        border: isSelected
          ? `0.5px solid rgba(${risk.glow}, 0.45)`
          : `0.5px solid ${ae.line}`,
        borderRadius: ae.radius,
        cursor: 'pointer',
        overflow: 'hidden',
        animation: `ember-fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) ${index * 60}ms both`,
        boxShadow: isSelected
          ? `0 0 0 0.5px rgba(${risk.glow}, 0.20), 0 14px 32px rgba(${risk.glow}, 0.18), inset 0 1px 0 rgba(255,255,255,0.04)`
          : 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.3)',
        transition:
          'border-color .25s ease, box-shadow .25s ease, transform .22s cubic-bezier(0.2, 0.7, 0.3, 1), background .3s ease',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {/* Cursor-following highlight */}
      <span aria-hidden className="inc-card-shine" />

      {/* Left severity bar */}
      <span
        aria-hidden
        className="inc-card-bar"
        style={{
          position: 'absolute',
          top: 14,
          bottom: 14,
          left: 7,
          width: 2.5,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${risk.color}, rgba(${risk.glow}, 0.45))`,
          boxShadow:
            isUrgent || isSelected ? `0 0 10px rgba(${risk.glow}, 0.65)` : 'none',
          opacity: isSelected ? 1 : 0.75,
          transition: 'opacity .25s ease, box-shadow .3s ease',
        }}
      />

      {/* Top hairline highlight when selected */}
      {isSelected ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 16,
            right: 16,
            height: 1,
            background: `linear-gradient(90deg, transparent, rgba(${risk.glow}, 0.55), transparent)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* Row 1: severity chip + ID + chevron */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '4px 9px 4px 8px',
            borderRadius: 999,
            background: `rgba(${risk.glow}, 0.12)`,
            border: `0.5px solid rgba(${risk.glow}, 0.32)`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              width: 5.5,
              height: 5.5,
              borderRadius: 99,
              background: risk.color,
              boxShadow: `0 0 8px ${risk.color}`,
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 700,
              color: risk.color,
              letterSpacing: '0.16em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            {RISK_LEVELS[severity].label}
          </span>
          {/* Shimmer pip for urgent (high/extreme) */}
          {isUrgent ? (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '40%',
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
                animation: 'inc-card-shimmer 3.4s linear infinite',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </div>

        <span
          className="inc-card-chev"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: isSelected ? risk.color : ae.textMute,
            transition: 'color .25s ease, transform .25s ease',
          }}
        >
          <Icon name="chevron" size={12} strokeWidth={2} />
        </span>
      </div>

      {/* Row 2: name */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 16.5,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fire.name}
        </div>
      </div>

      {/* Row 3: 3-stat grid with vertical dividers (NO containment bar) */}
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '10px 2px',
          background: 'rgba(255,255,255,0.02)',
          border: `0.5px solid ${ae.line}`,
          borderRadius: 8,
        }}
      >
        <Stat ae={ae} label="Dist" value={distLabel} dividerLeft={false} />
        <Stat ae={ae} label="Size" value={sizeLabel} unit="ac" dividerLeft />
        <Stat ae={ae} label="Cont" value={contLabel} unit="%" dividerLeft />
      </div>
    </button>
  );
}

function Stat({
  ae,
  label,
  value,
  unit,
  dividerLeft,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  value: string;
  unit?: string;
  dividerLeft: boolean;
}) {
  return (
    <div
      style={{
        padding: '0 10px',
        borderLeft: dividerLeft ? `0.5px solid ${ae.line}` : 'none',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9,
          fontWeight: 600,
          color: ae.textMute,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 15,
            fontWeight: 600,
            color: ae.text,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {value}
        </span>
        {unit && value !== '—' ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              color: ae.textMute,
              letterSpacing: '0.06em',
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Dual-feed tabs ────────────────────────────────────────────────────────

/** Stable key for a FIRMS satellite pixel — matches MapImpl's marker key so
 *  the rail's selection and the map's selection point at the same dot. */
function satKey(f: FireFeature): string {
  return `${f.properties.lat.toFixed(5)},${f.properties.lon.toFixed(5)}`;
}

/** Two co-equal feed tabs (Reported incidents / Satellite hotspots), each
 *  showing its own live count. Per-feed loading shows a count skeleton and
 *  per-feed error shows a neutral "—" + amber dot — so neither feed's state
 *  can be misread as the other's. */
function RailTabs({
  tab,
  onTabChange,
  incidentCount,
  satelliteCount,
  incidentsLoading,
  satellitesLoading,
  incidentsError,
  satellitesError,
}: {
  tab: RailTab;
  onTabChange: (t: RailTab) => void;
  incidentCount: number;
  satelliteCount: number;
  incidentsLoading: boolean;
  satellitesLoading: boolean;
  incidentsError: boolean;
  satellitesError: boolean;
}) {
  return (
    <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
      <RailTabButton
        active={tab === 'incidents'}
        onClick={() => onTabChange('incidents')}
        count={incidentCount}
        loading={incidentsLoading}
        error={incidentsError}
        label="Active incidents reported"
        color="#9aa6b2"
        glow="154, 166, 178"
      />
      <RailTabButton
        active={tab === 'hotspots'}
        onClick={() => onTabChange('hotspots')}
        count={satelliteCount}
        loading={satellitesLoading}
        error={satellitesError}
        label="Satellite detections"
        color="#ff7a3a"
        glow="255, 122, 58"
      />
    </div>
  );
}

function RailTabButton({
  active,
  onClick,
  count,
  loading,
  error,
  label,
  color,
  glow,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  loading: boolean;
  error: boolean;
  label: string;
  color: string;
  glow: string;
}) {
  const { ae } = useAesthetic();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: 'left',
        cursor: 'pointer',
        padding: '12px 14px',
        borderRadius: ae.radius,
        background: active
          ? `linear-gradient(180deg, rgba(${glow}, 0.12), rgba(${glow}, 0.02))`
          : 'rgba(255,255,255,0.02)',
        border: `0.5px solid ${active ? `rgba(${glow}, 0.45)` : ae.line}`,
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 18px rgba(${glow}, 0.12)`
          : 'none',
        transition: 'background .25s ease, border-color .25s ease',
        fontFamily: 'inherit',
        color: 'inherit',
      }}
    >
      {error ? (
        // Feed down — no count to show. Drop the giant em-dash and let
        // "Unavailable" be the prominent text instead. minHeight matches a
        // normal tab's two rows so paired tabs stay aligned when only one is
        // down. The amber dot carries the warning tone.
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 53 }}>
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              flexShrink: 0,
              background: '#E8B339',
              boxShadow: '0 0 8px rgba(232, 179, 57, 0.6)',
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '0.08em',
              color: ae.textDim,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Unavailable
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
            {loading ? (
              <Skeleton width={42} height={28} rounded="md" />
            ) : (
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 28,
                  fontWeight: ae.titleWeight,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  color: active ? ae.text : ae.textDim,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count}
              </span>
            )}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                flexShrink: 0,
                marginTop: 3,
                background: color,
                boxShadow: active ? `0 0 8px ${color}` : 'none',
              }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 700,
                lineHeight: 1.35,
                letterSpacing: '0.12em',
                color: active ? ae.textDim : ae.textMute,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {label}
            </span>
          </div>
        </>
      )}
    </button>
  );
}

/** Four placeholder cards — shared by both feeds' loading state (same footprint
 *  as a real card so the swap when data lands doesn't jolt the list height). */
function SkeletonCards() {
  const { ae } = useAesthetic();
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '14px 16px 14px 18px',
            marginBottom: 8,
            borderRadius: ae.radius,
            background: `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
            border: `0.5px solid ${ae.line}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <Skeleton width={70} height={20} rounded="full" />
            <Skeleton width={42} height={11} rounded="sm" />
          </div>
          <Skeleton width={'80%'} height={18} rounded="md" />
          <div style={{ marginTop: 6 }}>
            <Skeleton width={'55%'} height={11} rounded="sm" />
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            <Skeleton width={'100%'} height={32} rounded="md" />
            <Skeleton width={'100%'} height={32} rounded="md" />
            <Skeleton width={'100%'} height={32} rounded="md" />
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Empty-state panel ──────────────────────────────────────────────────────

/** Fills the list area when a feed has no items in range (success state, not
 *  loading/error). Replaces the dead blank space below the tabs with a
 *  centered all-clear panel: radar glyph + headline + search context +
 *  last-checked time, plus a button across to the sibling feed when it has
 *  items. */
function EmptyFeedPanel({
  kind,
  locationLabel,
  radiusLabel,
  syncedAt,
  siblingCount,
  onViewSibling,
}: {
  kind: 'incidents' | 'satellite';
  locationLabel: string;
  radiusLabel: string;
  syncedAt?: number;
  siblingCount: number;
  onViewSibling: () => void;
}) {
  const { ae } = useAesthetic();
  const isSat = kind === 'satellite';
  const accent = isSat ? '#ff7a3a' : '#9aa6b2';
  const glow = isSat ? '255, 122, 58' : '154, 166, 178';
  const headline = isSat ? 'No satellite detections nearby' : 'No active incidents nearby';
  const sub = isSat
    ? `No satellite fire detections near ${locationLabel} right now.`
    : `No active fire incidents within ${radiusLabel} of ${locationLabel} right now.`;
  const synced =
    syncedAt && syncedAt > 0
      ? new Date(syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : null;
  const siblingLabel = isSat
    ? `View ${siblingCount} ${siblingCount === 1 ? 'incident' : 'incidents'}`
    : `View ${siblingCount} satellite ${siblingCount === 1 ? 'detection' : 'detections'}`;

  return (
    <div
      className="app-empty-feed"
      style={{
        minHeight: 340,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '28px 26px',
        animation: 'ember-fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both',
      }}
    >
      <div
        style={{
          fontFamily: ae.fontDisplay,
          fontSize: 17,
          fontWeight: 600,
          color: ae.text,
          letterSpacing: ae.titleTracking,
        }}
      >
        {headline}
      </div>

      <p
        style={{
          margin: '9px 0 0',
          maxWidth: 264,
          fontFamily: ae.fontBody,
          fontSize: 13,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        {sub}
      </p>

      {synced ? (
        <div
          style={{
            marginTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: ae.fontMono,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            color: ae.textMute,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 99,
              background: '#3FB68B',
              boxShadow: '0 0 8px #3FB68B',
            }}
          />
          Checked {synced}
        </div>
      ) : null}

      {siblingCount > 0 ? (
        <button
          type="button"
          onClick={onViewSibling}
          style={{
            marginTop: 22,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            background: `rgba(${glow}, 0.10)`,
            border: `0.5px solid rgba(${glow}, 0.32)`,
            color: accent,
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            transition: 'background .2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `rgba(${glow}, 0.16)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `rgba(${glow}, 0.10)`;
          }}
        >
          {siblingLabel}
          <Icon name="chevron" size={11} color={accent} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}

// ─── Satellite Hotspot Card ─────────────────────────────────────────────────

/** A FIRMS satellite detection rendered as a card (orange, no severity tier —
 *  hot-pixels aren't NIFC-bucketed). Mirrors IncidentCard's rhythm so the two
 *  feeds read as siblings. Clicking selects the same pixel on the map. */
function SatelliteCardImpl({
  feature,
  index,
  isSelected,
  distanceMi,
  directionLabel,
  distanceUnit,
  onClick,
}: {
  feature: FireFeature;
  index: number;
  isSelected: boolean;
  distanceMi: number;
  /** Compass sector from the user to this pixel (e.g. "NE"), used to give each
   *  otherwise-nameless detection a distinguishable, location-based title. */
  directionLabel: string;
  distanceUnit: 'mi' | 'km';
  onClick: () => void;
}) {
  const { ae } = useAesthetic();
  const color = '#ff7a3a';
  const glow = '255, 122, 58';
  const p = feature.properties;
  const distLabel = formatDistance(distanceMi, distanceUnit, 1);
  const brightLabel = p.brightness != null ? Math.round(p.brightness).toString() : '—';
  const confLabel = confidenceLabel(p.confidence);
  // No name exists for a FIRMS pixel — title it by where it is relative to the
  // user so each card is distinguishable (they'd otherwise all read the same
  // satellite platform). The platform name still appears in the detail footer.
  const name = `${distLabel} ${directionLabel}`;

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={isSelected ? 'true' : 'false'}
      data-sat-key={satKey(feature)}
      className={`inc-card${isSelected ? ' inc-card-sel' : ''}`}
      style={{
        ['--ic-color' as string]: color,
        ['--ic-glow' as string]: glow,
        width: '100%',
        padding: '14px 16px 14px 18px',
        marginBottom: 8,
        textAlign: 'left',
        position: 'relative',
        background: isSelected
          ? `linear-gradient(180deg, rgba(${glow}, 0.12), rgba(${glow}, 0.04) 60%, ${ae.surface})`
          : `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
        border: isSelected ? `0.5px solid rgba(${glow}, 0.45)` : `0.5px solid ${ae.line}`,
        borderRadius: ae.radius,
        cursor: 'pointer',
        overflow: 'hidden',
        animation: `ember-fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) ${index * 40}ms both`,
        boxShadow: isSelected
          ? `0 0 0 0.5px rgba(${glow}, 0.20), 0 14px 32px rgba(${glow}, 0.18), inset 0 1px 0 rgba(255,255,255,0.04)`
          : 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.3)',
        transition:
          'border-color .25s ease, box-shadow .25s ease, transform .22s cubic-bezier(0.2, 0.7, 0.3, 1), background .3s ease',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      <span aria-hidden className="inc-card-shine" />

      {/* Left bar */}
      <span
        aria-hidden
        className="inc-card-bar"
        style={{
          position: 'absolute',
          top: 14,
          bottom: 14,
          left: 7,
          width: 2.5,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${color}, rgba(${glow}, 0.45))`,
          boxShadow: isSelected ? `0 0 10px rgba(${glow}, 0.65)` : 'none',
          opacity: isSelected ? 1 : 0.75,
          transition: 'opacity .25s ease, box-shadow .3s ease',
        }}
      />

      {/* Row 1: SATELLITE chip + chevron */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '4px 9px 4px 8px',
            borderRadius: 999,
            background: `rgba(${glow}, 0.12)`,
            border: `0.5px solid rgba(${glow}, 0.32)`,
          }}
        >
          <span
            style={{
              width: 5.5,
              height: 5.5,
              borderRadius: 99,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 700,
              color,
              letterSpacing: '0.16em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Satellite
          </span>
        </div>

        <span
          className="inc-card-chev"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: isSelected ? color : ae.textMute,
            transition: 'color .25s ease, transform .25s ease',
          }}
        >
          <Icon name="chevron" size={12} strokeWidth={2} />
        </span>
      </div>

      {/* Row 2: name */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 16.5,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
      </div>

      {/* Row 3: 3-stat grid (Dist / Bright / Seen) */}
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '10px 2px',
          background: 'rgba(255,255,255,0.02)',
          border: `0.5px solid ${ae.line}`,
          borderRadius: 8,
        }}
      >
        <Stat ae={ae} label="Dist" value={distLabel} dividerLeft={false} />
        <Stat
          ae={ae}
          label="Bright"
          value={brightLabel}
          unit={brightLabel !== '—' ? 'K' : undefined}
          dividerLeft
        />
        <Stat ae={ae} label="Conf" value={confLabel} dividerLeft />
      </div>
    </button>
  );
}

const SatelliteCard = memo(
  SatelliteCardImpl,
  (prev, next) =>
    prev.feature === next.feature &&
    prev.index === next.index &&
    prev.isSelected === next.isSelected &&
    prev.distanceMi === next.distanceMi &&
    prev.directionLabel === next.directionLabel &&
    prev.distanceUnit === next.distanceUnit,
);

// onClick is a fresh inline closure on every parent render — we know that's
// expected (it captures isSelected + onSelect from the parent). Skip it in
// the comparator so the card can bail when nothing visible actually changed.
const IncidentCard = memo(IncidentCardImpl, (prev, next) =>
  prev.fire === next.fire &&
  prev.severity === next.severity &&
  prev.index === next.index &&
  prev.isSelected === next.isSelected &&
  prev.isUrgent === next.isUrgent &&
  prev.distanceUnit === next.distanceUnit &&
  prev.risk.color === next.risk.color &&
  prev.risk.glow === next.risk.glow &&
  prev.risk.label === next.risk.label,
);

// ─── Minimal selected-row footer ──────────────────────────────────────────

/** Compact selection footer pinned to the bottom of the rail. Shows only:
 *  dot + "Selected" label + fire name + distance, then a single
 *  Open-Incident-Report CTA below. No 3-stat grid, no Limited-data callout,
 *  no close X — the user unselects by clicking the same card (or marker)
 *  again. The same data is still visible in the card list above, so this
 *  footer just confirms "what's selected" and provides the route-through
 *  to the full detail page. */
/** Optional stat tile rendered in the footer's mid-strip. Same shape as the
 *  IncidentCard's Dist/Size/Cont tiles so the visual rhythm carries over. */
export type FooterStat = { label: string; value: string; unit?: string };

function DetailFooter({
  label,
  name,
  distanceLabel,
  accentColor,
  accentGlow,
  detailHref,
  stats,
}: {
  label: string;
  name: string;
  distanceLabel: string;
  accentColor: string;
  accentGlow: string;
  detailHref: string;
  /** Optional 3-up stat strip rendered between the summary row and the
   *  CTA. Used for satellite pixels where the rail has no card with the
   *  Brightness/Confidence/Detected info — gives the footer enough
   *  substance to stand on its own. */
  stats?: FooterStat[];
}) {
  const { ae } = useAesthetic();
  return (
    <div
      className="app-map-detail-footer"
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '16px 18px 18px',
        borderTop: `0.5px solid ${ae.line}`,
        background: `linear-gradient(180deg, transparent, ${ae.surface} 30%)`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      }}
    >
      {/* Accent-tinted top hairline */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 22,
          right: 22,
          height: 1,
          background: `linear-gradient(90deg, transparent, rgba(${accentGlow}, 0.40), transparent)`,
          pointerEvents: 'none',
        }}
      />

      {/* Selected fire summary above the button */}
      <div
        className="app-map-footer-summary"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 99,
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {label}
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: ae.fontDisplay,
                fontSize: 13.5,
                fontWeight: 600,
                color: ae.text,
                letterSpacing: ae.titleTracking,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 220,
              }}
            >
              {name}
            </div>
          </div>
        </div>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10,
            color: ae.textMute,
            letterSpacing: '0.06em',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {distanceLabel}
        </span>
      </div>

      {stats && stats.length > 0 ? (
        <div
          className="app-map-footer-stats"
          style={{
            marginBottom: 12,
            display: 'grid',
            gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
            padding: '10px 2px',
            background: 'rgba(255,255,255,0.02)',
            border: `0.5px solid ${ae.line}`,
            borderRadius: 8,
          }}
        >
          {stats.map((s, i) => (
            <Stat
              key={s.label}
              ae={ae}
              label={s.label}
              value={s.value}
              unit={s.unit}
              dividerLeft={i > 0}
            />
          ))}
        </div>
      ) : null}

      <Link
        href={detailHref}
        style={{
          height: 44,
          width: '100%',
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
          color: '#fff',
          background: `linear-gradient(180deg, ${accentColor}, rgba(${accentGlow}, 0.85))`,
          border: `0.5px solid rgba(${accentGlow}, 0.45)`,
          boxShadow: `0 0 0 0.5px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.16) inset, 0 10px 30px rgba(${accentGlow}, 0.35)`,
          textDecoration: 'none',
          transition: 'transform 0.18s cubic-bezier(0.2, 0.7, 0.3, 1)',
        }}
        className="inc-rail-cta"
      >
        Open full report
        <Icon name="chevron" size={11} color="#fff" strokeWidth={2.4} />
      </Link>
    </div>
  );
}

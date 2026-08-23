'use client';

// The rail down the right of the map. A header, a scrolling list of fire cards, and
// a footer describing whatever is selected, incident or pixel. The hairline and inner
// shadow are what make it look overlaid on the map instead of sitting beside it.

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
import { confidenceLabel, firmsDetailHref, satKey, satelliteTitle } from '@/lib/firms';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { firmsNote, incidentFeedNote, useSourceHealth } from '@/lib/source-health';
import { formatDistance, useUnits } from '@/lib/use-units';

/** Which feed the list is showing. Named incidents or satellite detections, and
 *  neither outranks the other. */
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
  /** The satellite detections on the map, also browsable as cards here. */
  satellites: FireFeature[];
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  locationLabel: string;
  severityOf: (f: NamedIncident) => RiskLevel;
  isLoading?: boolean;
  /** The satellite feed is still loading. */
  satellitesLoading?: boolean;
  /** The incident feed failed. */
  incidentsError?: boolean;
  /** The satellite feed failed. Tracked separately, because one feed going down
   *  shouldn't hide the other. */
  satellitesError?: boolean;
  onRetry?: () => void;
  /** The open tab. MapScreen owns it, so clicking a marker can switch to it. */
  tab: RailTab;
  onTabChange: (t: RailTab) => void;
  /** Where the user is. Needed to measure distance to satellite pixels, which
   *  don't carry their own the way incidents do. */
  userCoords: LatLon;
  /** The radius named in the subtitle. */
  radiusMi?: number;
  /** When each feed last landed, shown as "Checked HH:MM" on the empty state. */
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

  // The same pixels the map draws, resorted by distance, so every dot has a card.
  const satList = useMemo(
    () =>
      [...satellites].sort(
        (a, b) =>
          distanceMiles(userCoords, { lat: a.properties.lat, lon: a.properties.lon }) -
          distanceMiles(userCoords, { lat: b.properties.lat, lon: b.properties.lon }),
      ),
    [satellites, userCoords],
  );

  // So an outage says "feed down" and not "nothing out there".
  const health = useSourceHealth();
  const firmsDown = firmsNote(health) !== null;
  const incidentsFullyDown = health.nifc === 'down' && health.calfire === 'down';

  // Order matters. A real error wins, then loading, then the feed-down note. The
  // health store isn't location-scoped and remembers an outage for twenty minutes, so
  // checking it first flashes a stale warning while this fetch is still in the air.
  const railSubtitle = (() => {
    if (tab === 'incidents') {
      if (incidentsError) return 'Incident feed unavailable';
      if (isLoading && fires.length === 0) return 'Loading incidents…';
      const note = incidentFeedNote(health);
      if (note) return note;
      if (fires.length === 0) return 'No active incidents reported within range';
      return `Within ${formatDistance(radiusMi, units.distance, 0)} of ${locationLabel} · sorted by distance`;
    }
    if (satellitesError) return 'Satellite feed unavailable';
    if (satellitesLoading && satellites.length === 0) return 'Loading detections…';
    const note = firmsNote(health);
    if (note) return note;
    if (satellites.length === 0) return 'No satellite detections within range';
    return 'NASA FIRMS · last 24h · may include controlled burns';
  })();

  // Scroll the selected card into view, so a marker click brings it into focus.
  // Re-runs when the list arrives too, because a selection made while the feed was
  // loading finds no card to scroll to on the first pass.
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
  }, [selection, tab, fires, satellites]);

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
      {/* Left edge hairline, makes the rail feel overlaid on the map */}
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

      {/* Header */}
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

            {/* Explainer info button */}
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

        {/* Both feeds are co-equal here. A single headline count used to hide the
            satellite layer and read "0" with the map full of FIRMS dots. */}
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

      {/* List */}
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
            {/* A degraded feed returns an empty 200, not an isError, so without
                this the "Unavailable" tab would be blank space. */}
            {!incidentsError && !isLoading && fires.length === 0 && incidentsFullyDown ? (
              <DataErrorState
                compact
                title="Incident feed unavailable"
                message="Couldn't load NIFC and Cal Fire incidents right now. Satellite detections (if any) still show on the map and the Satellite detections tab. Try again."
                onRetry={onRetry}
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
            {/* Same for a degraded FIRMS feed. */}
            {!satellitesError && !satellitesLoading && satellites.length === 0 && firmsDown ? (
              <DataErrorState
                compact
                title="Satellite feed unavailable"
                message="Couldn't load NASA FIRMS detections right now. Named incidents (if any) still show on the Active incidents reported tab. Try again."
                onRetry={onRetry}
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

      {/* The selection footer, kept thin. Everything it could show is already on
          the card above, and clicking that card again unselects it. */}
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

/** Three quick stats for a satellite pixel, laid out like the incident card's
 *  strip so both footers read the same way. */
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

/** Ages as "20m", "3h" or "2d", short enough to sit beside the other stats
 *  without wrapping. */
function firmsAgeShort(ageHr: number | null): string {
  if (ageHr == null) return '—';
  if (ageHr < 1) return `${Math.max(1, Math.round(ageHr * 60))}m`;
  if (ageHr < 24) return `${Math.round(ageHr)}h`;
  return `${Math.round(ageHr / 24)}d`;
}

// Incident card

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

  // Measuring the card forces a layout, so do it once on enter and not sixty times
  // a second while the cursor moves.
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

      {/* Row 1, the severity chip, ID and chevron */}
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

      {/* Row 2, name */}
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

// Dual-feed tabs

/** The two feed tabs, each with its own count. Loading and failure states are
 *  per tab, so neither feed's trouble can be mistaken for the other's. */
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
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = `rgba(${glow}, 0.06)`;
        e.currentTarget.style.borderColor = `rgba(${glow}, 0.28)`;
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.borderColor = ae.line;
      }}
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
      {error && !loading ? (
        // The height matches a normal tab so the pair stays aligned when only one
        // is down. Gated on loading, or a stale outage from an earlier visit would
        // show over a cold fetch.
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

/** Placeholder cards, sized like real ones so the list doesn't jump when the
 *  data lands. */
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

// Empty-state panel

/** What fills the list when a healthy feed genuinely has nothing in range. An
 *  all-clear panel beats blank space, and it offers a jump to the other feed
 *  when that one does have something. */
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

// Satellite hotspot card

/** A satellite detection as a card. No severity tier, because nobody has assessed a
 *  raw pixel. Shaped like the incident card so the feeds look like siblings. */
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
  /** Which way it lies from the user, which is how these get their titles. */
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
  // Nobody names a satellite pixel, so title it by where it is, or every card
  // reads the same.
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

      {/* Row 1, the SATELLITE chip and chevron */}
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

      {/* Row 2, name */}
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

      {/* Row 3, 3-stat grid (Dist / Bright / Seen) */}
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

// onClick is a new closure every parent render by design, so leave it out of the
// comparison and let the card skip a re-render when nothing visible moved.
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

// Minimal selected-row footer

/** A stat tile for the footer strip, shaped like the ones on the cards. */
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
  /** Stats between the summary and the button. Satellite pixels use it, because
   *  their brightness and confidence appear nowhere else in the rail. */
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

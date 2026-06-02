'use client';

// "Open Shelters" — tier-1 list of shelters reported OPEN right now by
// Emergency Management / the Red Cross (the activated layer). Renders nothing
// when no activated shelters are present (the common case), so the Safety
// screen stays clean until there's a real reason to show it.
//
// Each shelter carries the live signal a candidate facility can't: status,
// occupancy/capacity, ADA + pet accommodation, managing org, and freshness.

import { Icon } from '@/components/Icon';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { cardinal8 } from '@/components/ui/CompassRose';
import { useAesthetic } from '@/lib/aesthetic';
import type { LatLon, Shelter, ShelterStatus } from '@/lib/api';
import { formatDistance, useUnits } from '@/lib/use-units';

const STATUS_TONE: Record<ShelterStatus, { color: string; rgb: string; label: string }> = {
  OPEN: { color: '#3FB68B', rgb: '63, 182, 139', label: 'Open now' },
  STANDBY: { color: '#E8B339', rgb: '232, 179, 57', label: 'Standby' },
  FULL: { color: '#F04438', rgb: '240, 68, 56', label: 'At capacity' },
};

function bearingTo(from: LatLon, to: LatLon): number {
  const dLon = (to.lon - from.lon) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function gmapsDirectionsUrl(origin: LatLon, dest: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}&travelmode=driving`;
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hr ago`;
}

export function OpenSheltersCard({
  shelters,
  origin,
  isLoading = false,
}: {
  shelters: Shelter[] | undefined;
  origin: LatLon;
  isLoading?: boolean;
}) {
  const { ae } = useAesthetic();

  // Loading: only show a skeleton card if we don't yet know whether there are
  // any open shelters. Once resolved with none, render nothing.
  if (isLoading && !shelters) {
    return (
      <div
        className="ember-card"
        style={{
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: ae.cardBorder,
          borderRadius: ae.radiusLg,
          padding: 20,
        }}
      >
        <Skeleton width={150} height={14} rounded="sm" />
        <div style={{ marginTop: 14 }}>
          <Skeleton width="100%" height={72} rounded="md" />
        </div>
      </div>
    );
  }

  const open = (shelters ?? []).filter((s) => s.activated);
  if (open.length === 0) return null;

  const green = STATUS_TONE.OPEN;

  return (
    <div
      className="ember-card ember-hero-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${green.rgb}, 0.32)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 20px 50px rgba(${green.rgb}, 0.12)`,
        ['--card-accent' as string]: green.color,
        ['--card-accent-soft' as string]: `rgba(${green.rgb}, 0.16)`,
      }}
    >
      <GridPattern opacity={0.04} />
      <div style={{ position: 'relative', padding: 22 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: green.color,
              boxShadow: `0 0 9px ${green.color}`,
              animation: 'ember-flicker 1.8s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              color: green.color,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Open Shelters
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: ae.fontMono,
              fontSize: 10,
              color: ae.textMute,
              letterSpacing: '0.08em',
            }}
          >
            {open.length} reported nearby
          </span>
        </div>

        <p
          style={{
            margin: '8px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 12,
            lineHeight: 1.5,
            color: ae.textMute,
          }}
        >
          Reported open by emergency management — live status &amp; capacity.
        </p>

        {/* Shelter rows */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {open.map((s) => (
            <ShelterRow key={s.id} shelter={s} origin={origin} ae={ae} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShelterRow({
  shelter: s,
  origin,
  ae,
}: {
  shelter: Shelter;
  origin: LatLon;
  ae: ReturnType<typeof useAesthetic>['ae'];
}) {
  const units = useUnits();
  const status: ShelterStatus = s.status ?? 'OPEN';
  const tone = STATUS_TONE[status];
  const dirLabel = cardinal8(bearingTo(origin, { lat: s.lat, lon: s.lon }));
  const updated = timeAgo(s.updated_at);
  const hasCap = s.capacity != null && s.capacity > 0;
  const occ = s.occupancy ?? 0;
  const pct = hasCap ? Math.max(0, Math.min(1, occ / s.capacity!)) : 0;
  // Bar fills green → amber → red as occupancy rises.
  const barColor = status === 'FULL' || pct >= 0.9 ? '#F04438' : pct >= 0.7 ? '#E8B339' : '#3FB68B';

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: `linear-gradient(180deg, rgba(${tone.rgb}, 0.06), rgba(${tone.rgb}, 0.02))`,
        border: `0.5px solid rgba(${tone.rgb}, 0.22)`,
      }}
    >
      {/* Name + status badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 15,
              fontWeight: 600,
              color: ae.text,
              letterSpacing: ae.titleTracking,
              lineHeight: 1.2,
            }}
          >
            {s.name}
          </div>
          <div
            style={{
              marginTop: 3,
              fontFamily: ae.fontMono,
              fontSize: 11,
              color: ae.textDim,
              letterSpacing: '0.02em',
            }}
          >
            {formatDistance(s.distance_mi, units.distance, 1)} {dirLabel}
            {s.address ? ` · ${s.address}` : ''}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 99,
            background: `rgba(${tone.rgb}, 0.14)`,
            border: `0.5px solid ${tone.color}`,
            fontFamily: ae.fontMono,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: tone.color,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 99, background: tone.color, boxShadow: `0 0 6px ${tone.color}` }} />
          {tone.label}
        </span>
      </div>

      {/* Capacity bar */}
      {hasCap ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: ae.fontMono,
              fontSize: 10,
              color: ae.textMute,
              letterSpacing: '0.04em',
              marginBottom: 5,
            }}
          >
            <span>{status === 'STANDBY' ? 'Capacity' : 'Occupancy'}</span>
            <span style={{ color: ae.textDim, fontVariantNumeric: 'tabular-nums' }}>
              {status === 'STANDBY' ? `${s.capacity}` : `${occ} / ${s.capacity} · ${Math.round(pct * 100)}%`}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: ae.line, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(status === 'STANDBY' ? 0 : pct) * 100}%`,
                height: '100%',
                borderRadius: 99,
                background: `linear-gradient(90deg, rgba(${tone.rgb}, 0.5), ${barColor})`,
                boxShadow: `0 0 8px ${barColor}`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Chips + directions */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {s.pet_friendly ? <Chip ae={ae} label="Pets OK" /> : null}
        {s.ada_accessible ? <Chip ae={ae} label="ADA" /> : null}
        {s.managing_org ? <Chip ae={ae} label={s.managing_org} muted /> : null}
        <a
          href={gmapsDirectionsUrl(origin, { lat: s.lat, lon: s.lon })}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 8,
            background: `rgba(${tone.rgb}, 0.10)`,
            border: `0.5px solid rgba(${tone.rgb}, 0.32)`,
            color: tone.color,
            fontFamily: ae.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="external" size={11} color={tone.color} strokeWidth={1.8} />
          Directions
        </a>
      </div>

      {updated ? (
        <div
          style={{
            marginTop: 9,
            fontFamily: ae.fontMono,
            fontSize: 9.5,
            color: ae.textMute,
            letterSpacing: '0.06em',
          }}
        >
          Updated {updated}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ ae, label, muted = false }: { ae: ReturnType<typeof useAesthetic>['ae']; label: string; muted?: boolean }) {
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        border: `0.5px solid ${ae.line}`,
        fontFamily: ae.fontMono,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: muted ? ae.textMute : ae.textDim,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

'use client';

// Shelter status language — shared between the Evacuation card's "Nearest
// Shelter" mode pieces. Two visual registers:
//   • CONFIRMED / LIVE (shelter.activated) — verified, operational: solid tinted
//     tile, status-colored accent bar + soft glow, "Open now" badge with a
//     live pulse dot, capacity bar + ADA/pet/org metadata, freshness.
//   • POTENTIAL (candidate) — tentative / recommended: muted, dashed-hairline
//     tile, no glow, a hollow "Potential site" badge, a call-ahead note.
// Kept deliberately calm (no alert banners) so it stays cohesive with the
// premium card it lives inside.

import { Icon } from '@/components/Icon';
import { cardinal8 } from '@/components/ui/CompassRose';
import { useAesthetic } from '@/lib/aesthetic';
import type { LatLon, Shelter } from '@/lib/api';
import { formatDistance, useUnits } from '@/lib/use-units';

type Ae = ReturnType<typeof useAesthetic>['ae'];

const LIVE_TONES: Record<string, { color: string; rgb: string; label: string }> = {
  OPEN: { color: '#3FB68B', rgb: '63, 182, 139', label: 'Open now' },
  STANDBY: { color: '#E8B339', rgb: '232, 179, 57', label: 'Standby' },
  FULL: { color: '#F04438', rgb: '240, 68, 56', label: 'At capacity' },
};
const POTENTIAL_TONE = { color: '#9ca3af', rgb: '156, 163, 175', label: 'Potential site' };

export function shelterTone(s: Shelter): { color: string; rgb: string; label: string } {
  if (s.activated) return LIVE_TONES[s.status ?? 'OPEN'] ?? LIVE_TONES.OPEN;
  return POTENTIAL_TONE;
}

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
  if (mins < 1440) {
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? '1 hr ago' : `${hrs} hr ago`;
  }
  const days = Math.round(mins / 1440);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Honest freshness line from the NSS record. "Updated" only when NSS actually
 *  reported a status (reporting_period); otherwise "Opened" from the open date.
 *  Both are NSS timestamps, never our fetch time. */
function freshnessLabel(s: Shelter): string | null {
  const updated = timeAgo(s.updated_at);
  if (updated) return `Updated ${updated}`;
  const opened = timeAgo(s.opened_at);
  if (opened) return `Opened ${opened}`;
  return null;
}

function humanizeType(type: string | null | undefined): string | null {
  if (!type) return null;
  const t = type.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Status pill: a live pulse dot + "Open now" for confirmed shelters; a hollow
 *  dashed ring + "Potential site" for candidates. */
export function ShelterStatusBadge({ shelter, ae }: { shelter: Shelter; ae: Ae }) {
  const live = !!shelter.activated;
  const t = shelterTone(shelter);
  return (
    <span
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 99,
        background: live ? `rgba(${t.rgb}, 0.14)` : 'transparent',
        border: live ? `0.5px solid ${t.color}` : `0.5px dashed rgba(${t.rgb}, 0.55)`,
        fontFamily: ae.fontMono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: t.color,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {live ? (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            background: t.color,
            boxShadow: `0 0 6px ${t.color}`,
            animation: 'ember-flicker 1.8s ease-in-out infinite',
          }}
        />
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            border: `1px dashed ${t.color}`,
          }}
        />
      )}
      {t.label}
    </span>
  );
}

/** The detail tile that swaps registers between live and potential. */
export function ShelterDetailTile({
  shelter,
  ae,
}: {
  shelter: Shelter;
  ae: Ae;
}) {
  const units = useUnits();
  const live = !!shelter.activated;
  const t = shelterTone(shelter);

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 15,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
            lineHeight: 1.25,
          }}
        >
          {shelter.name}
        </div>
      </div>
      <ShelterStatusBadge shelter={shelter} ae={ae} />
    </div>
  );

  if (!live) {
    // POTENTIAL — tentative / recommended fallback.
    const typeLabel = humanizeType(shelter.type);
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '0.5px dashed rgba(255, 255, 255, 0.16)',
        }}
      >
        {header}
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: ae.textDim,
          }}
        >
          Community-tagged location — not confirmed open. Call ahead before relying on it.
        </p>
        {typeLabel ? (
          <div style={{ marginTop: 10 }}>
            <Chip ae={ae} label={typeLabel} muted />
          </div>
        ) : null}
      </div>
    );
  }

  // LIVE — verified, operational.
  const hasCap = shelter.capacity != null && shelter.capacity > 0;
  const occ = shelter.occupancy ?? 0;
  const pct = hasCap ? Math.max(0, Math.min(1, occ / shelter.capacity!)) : 0;
  const status = shelter.status ?? 'OPEN';
  const barColor = status === 'FULL' || pct >= 0.9 ? '#F04438' : pct >= 0.7 ? '#E8B339' : '#3FB68B';
  const freshness = freshnessLabel(shelter);

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        marginTop: 16,
        padding: '14px 14px 14px 16px',
        borderRadius: 12,
        background: `linear-gradient(180deg, rgba(${t.rgb}, 0.08), rgba(${t.rgb}, 0.02))`,
        border: `0.5px solid rgba(${t.rgb}, 0.30)`,
        boxShadow: `0 0 24px rgba(${t.rgb}, 0.08)`,
      }}
    >
      {/* Operational accent bar */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: 99,
          background: t.color,
          boxShadow: `0 0 8px ${t.color}`,
        }}
      />
      {header}

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
              {status === 'STANDBY'
                ? `${shelter.capacity}`
                : `${occ} / ${shelter.capacity} · ${Math.round(pct * 100)}%`}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: ae.line, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(status === 'STANDBY' ? 0 : pct) * 100}%`,
                height: '100%',
                borderRadius: 99,
                background: `linear-gradient(90deg, rgba(${t.rgb}, 0.5), ${barColor})`,
                boxShadow: `0 0 8px ${barColor}`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {shelter.pet_friendly ? <Chip ae={ae} label="Pets OK" /> : null}
        {shelter.ada_accessible ? <Chip ae={ae} label="ADA" /> : null}
        {shelter.managing_org ? <Chip ae={ae} label={shelter.managing_org} muted /> : null}
        {freshness ? (
          <span
            title="From the FEMA National Shelter System record"
            style={{
              marginLeft: 'auto',
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              color: ae.textMute,
              letterSpacing: '0.06em',
            }}
          >
            {freshness}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Compact list of additional open shelters beyond the targeted one. */
export function OtherOpenShelters({
  shelters,
  origin,
  ae,
}: {
  shelters: Shelter[];
  origin: LatLon;
  ae: Ae;
}) {
  const units = useUnits();
  if (!shelters.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: ae.textMute,
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
          marginBottom: 8,
        }}
      >
        Other open shelters
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shelters.map((s) => {
          const t = shelterTone(s);
          const dir = cardinal8(bearingTo(origin, { lat: s.lat, lon: s.lon }));
          return (
            <a
              key={s.id}
              href={gmapsDirectionsUrl(origin, { lat: s.lat, lon: s.lon })}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 9,
                background: 'rgba(255, 255, 255, 0.02)',
                border: `0.5px solid ${ae.line}`,
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: t.color,
                  boxShadow: `0 0 6px ${t.color}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: ae.fontDisplay,
                  fontSize: 13,
                  color: ae.text,
                  letterSpacing: ae.titleTracking,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.name}
              </span>
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 10.5,
                  color: ae.textDim,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatDistance(s.distance_mi, units.distance, 1)} {dir}
              </span>
              <Icon name="external" size={11} color={ae.textMute} strokeWidth={1.8} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ ae, label, muted = false }: { ae: Ae; label: string; muted?: boolean }) {
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
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

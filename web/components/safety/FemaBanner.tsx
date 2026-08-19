'use client';

// Full-width FEMA banner for the Safety screen (24x32 padding, 80px icon box)
// with two action CTAs: Show on Map and FEMA Page. Only shown when there's an
// active declaration.

import { useRouter } from 'next/navigation';

import { Icon } from '@/components/Icon';
import { StripePattern } from '@/components/ui/StripePattern';
import { useAesthetic } from '@/lib/aesthetic';
import type { ActiveDisaster } from '@/lib/api';
import { matchIncidentByFemaTitle } from '@/lib/fema-match';
import { useNamedIncidentsNear } from '@/lib/queries';
import { RISK_LEVELS } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

const AMBER = RISK_LEVELS.moderate.color;
const AMBER_RGB = RISK_LEVELS.moderate.glow;

export function FemaBanner({ disaster }: { disaster: ActiveDisaster }) {
  const { ae } = useAesthetic();
  const router = useRouter();

  // Gate the Show-on-Map button on whether the map will actually find the
  // FEMA-declared incident. We run the SAME query MapScreen runs (100mi /
  // 30-limit) so the cache entry is shared — when the user clicks through,
  // the map gets the data instantly and its own match check agrees with
  // ours. Without this gate, the button always showed but clicking it
  // either selected a random nearby fire (the old bug) or selected nothing
  // (after the bug fix) — both of which left the user confused.
  const loc = useUserLocation();
  const incidentsQ = useNamedIncidentsNear(loc.coords, 100, 30);
  const incidents = incidentsQ.data ?? [];
  const matched = matchIncidentByFemaTitle(disaster.title, incidents);
  // Hide the button while the query is in flight too — pops in once we
  // confirm there's something to select. Avoids flash-of-button-then-no-op.
  const canShowOnMap = !incidentsQ.isLoading && matched !== null;

  const showOnMap = () => {
    const qs = new URLSearchParams({
      from: 'fema',
      disaster: `${disaster.declaration_type}-${disaster.disaster_number}`,
      title: disaster.title,
    });
    router.push(`/map?${qs.toString()}`);
  };
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Matte-glass surface (matches the Safety cards) with an amber tint so
        // the federal-alert identity stays distinct from the neutral cards.
        background: `linear-gradient(180deg, rgba(${AMBER_RGB},0.10), rgba(${AMBER_RGB},0.035)), linear-gradient(180deg, rgba(17,21,27,0.62), rgba(13,17,23,0.55))`,
        border: `0.5px solid rgba(${AMBER_RGB}, 0.34)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 16px 50px rgba(0,0,0,0.35), 0 0 44px rgba(${AMBER_RGB}, 0.10)`,
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        marginBottom: 20,
      }}
    >
      <StripePattern color={AMBER} opacity={0.04} />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -40,
          right: '20%',
          width: 240,
          height: 240,
          borderRadius: '50%',
          filter: 'blur(28px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${AMBER_RGB}, 0.18), transparent 70%)`,
        }}
      />
      <div
        className="app-flex-col"
        style={{
          position: 'relative',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 18,
            background: `radial-gradient(circle at 30% 30%, rgba(${AMBER_RGB}, 0.30), rgba(${AMBER_RGB}, 0.10))`,
            border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
            boxShadow: `0 6px 22px rgba(${AMBER_RGB}, 0.20), inset 0 1px 0 rgba(255,255,255,0.10)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="warn" size={36} color={AMBER} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: AMBER,
                boxShadow: `0 0 8px ${AMBER}`,
                animation: 'ember-flicker 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                color: AMBER,
                letterSpacing: '0.20em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              FEMA Active
            </span>
            <span style={{ color: ae.textMute, fontFamily: ae.fontMono, fontSize: 11 }}>·</span>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textMute,
                letterSpacing: '0.10em',
              }}
            >
              {disaster.declaration_type}-{disaster.disaster_number} · {disaster.title}
            </span>
          </div>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 26,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.02em',
              color: ae.text,
              lineHeight: 1.1,
            }}
          >
            Federal disaster declaration active
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: ae.fontBody,
              fontSize: 14,
              color: ae.textDim,
              lineHeight: 1.5,
            }}
          >
            Designated for {disaster.designated_area}. Check FEMA.gov for the assistance that may be
            available in your area.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {canShowOnMap ? (
            <button
              type="button"
              onClick={showOnMap}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.26), rgba(${AMBER_RGB}, 0.10))`;
                e.currentTarget.style.borderColor = `rgba(${AMBER_RGB}, 0.55)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.18), rgba(${AMBER_RGB}, 0.06))`;
                e.currentTarget.style.borderColor = `rgba(${AMBER_RGB}, 0.40)`;
              }}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.18), rgba(${AMBER_RGB}, 0.06))`,
                border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
                color: AMBER,
                transition: 'background .16s ease, border-color .16s ease',
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <Icon name="pin" size={12} color={AMBER} strokeWidth={1.8} /> Show on Map
            </button>
          ) : null}
          {disaster.url ? (
            <a
              href={disaster.url}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `rgba(${AMBER_RGB}, 0.12)`;
                e.currentTarget.style.borderColor = `rgba(${AMBER_RGB}, 0.55)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = `rgba(${AMBER_RGB}, 0.40)`;
              }}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: 'transparent',
                border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
                color: AMBER,
                transition: 'background .16s ease, border-color .16s ease',
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textDecoration: 'none',
              }}
            >
              FEMA Page <Icon name="external" size={12} color={AMBER} strokeWidth={1.8} />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

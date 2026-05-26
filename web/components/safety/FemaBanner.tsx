'use client';

// Full-width FEMA banner for the Safety screen. Bigger than the Status FemaCard
// (24x32 padding, 80px icon box) with three action CTAs: Show on Map, FEMA Page,
// Apply for Assistance. Only shown when there's an active declaration.

import { useRouter } from 'next/navigation';

import { Icon } from '@/components/Icon';
import { StripePattern } from '@/components/ui/StripePattern';
import { useAesthetic } from '@/lib/aesthetic';
import type { ActiveDisaster } from '@/lib/api';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

export function FemaBanner({ disaster }: { disaster: ActiveDisaster }) {
  const { ae } = useAesthetic();
  const router = useRouter();

  // "Show on Map" hands the user off to /map with a query hint so MapScreen
  // can auto-select the closest incident (mirrors mobile's IntentProvider flow).
  const showOnMap = () => {
    router.push(`/map?from=fema&disaster=${disaster.declaration_type}-${disaster.disaster_number}`);
  };
  return (
    <div
      className="ember-card ember-hero-card"
      style={{
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${AMBER_RGB}, 0.28)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 20px 50px rgba(${AMBER_RGB}, 0.10)`,
        marginBottom: 20,
        ['--card-accent' as string]: AMBER,
        ['--card-accent-soft' as string]: `rgba(${AMBER_RGB}, 0.18)`,
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
            Federal disaster declaration · individual assistance open
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
            Designated for {disaster.designated_area}. Households in the impact zone are eligible
            for housing and other needs assistance.
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
          <button
            type="button"
            onClick={showOnMap}
            style={{
              height: 40,
              padding: '0 18px',
              borderRadius: 10,
              background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.18), rgba(${AMBER_RGB}, 0.06))`,
              border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
              color: AMBER,
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
          {disaster.url ? (
            <a
              href={disaster.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: 'transparent',
                border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
                color: AMBER,
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

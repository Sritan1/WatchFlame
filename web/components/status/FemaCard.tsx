'use client';

// FEMA federal-advisory card. Renders the single most recent active disaster
// for the user's county (if any). Stripe overlay + corner radial glow give
// it the official feel from the reference.

import { Icon } from '@/components/Icon';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { StripePattern } from '@/components/ui/StripePattern';
import { useAesthetic } from '@/lib/aesthetic';
import type { ActiveDisaster } from '@/lib/api';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

export function FemaCard({ disaster }: { disaster: ActiveDisaster }) {
  const { ae } = useAesthetic();
  return (
    <>
      <SectionEyebrow color={AMBER}>Federal Advisory</SectionEyebrow>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${AMBER_RGB}, 0.28)`,
          borderRadius: ae.radius,
          boxShadow: `0 20px 50px rgba(${AMBER_RGB}, 0.10), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${AMBER}, transparent)`,
            boxShadow: `0 0 14px ${AMBER}`,
          }}
        />
        <StripePattern color={AMBER} opacity={0.04} />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            filter: 'blur(28px)',
            pointerEvents: 'none',
            background: `radial-gradient(circle, rgba(${AMBER_RGB}, 0.18), transparent 70%)`,
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: 24,
            display: 'flex',
            gap: 22,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: `radial-gradient(circle at 30% 30%, rgba(${AMBER_RGB}, 0.30), rgba(${AMBER_RGB}, 0.10))`,
              border: `0.5px solid rgba(${AMBER_RGB}, 0.40)`,
              boxShadow: `0 6px 20px rgba(${AMBER_RGB}, 0.20), inset 0 1px 0 rgba(255,255,255,0.10)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="warn" size={32} color={AMBER} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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
                  fontSize: 10,
                  fontWeight: 700,
                  color: AMBER,
                  letterSpacing: '0.18em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                FEMA · {disaster.title}
              </span>
            </div>
            <div
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 24,
                fontWeight: ae.titleWeight,
                letterSpacing: ae.titleTracking,
                color: ae.text,
                lineHeight: 1.05,
              }}
            >
              {disaster.declaration_type}-{disaster.disaster_number} ·{' '}
              {disaster.incident_type.toLowerCase() === 'fire' ? 'Federal disaster declaration' : disaster.incident_type}{' '}
              active for your county
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: ae.fontBody,
                fontSize: 13,
                color: ae.textDim,
                lineHeight: 1.45,
              }}
            >
              Designated for {disaster.designated_area} · declared {disaster.declaration_date}
            </div>
          </div>
          {disaster.url ? (
            <a
              href={disaster.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                background: 'transparent',
                border: `0.5px solid rgba(${AMBER_RGB}, 0.25)`,
                color: AMBER,
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              FEMA Page <Icon name="external" size={12} color={AMBER} strokeWidth={1.8} />
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

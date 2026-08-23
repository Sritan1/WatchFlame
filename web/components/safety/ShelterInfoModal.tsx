'use client';

// These are not official Red Cross shelters. They come from community-tagged
// OpenStreetMap data and NCES school records.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

const AMBER = RISK_LEVELS.moderate.color;
const AMBER_RGB = RISK_LEVELS.moderate.glow;

export function ShelterInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Shelters" title="About these shelter locations" maxWidth={560}>
      <p style={textBody(ae)}>
        When emergency management or the Red Cross report a shelter{' '}
        <strong style={{ color: ae.text }}>open</strong>, it appears at the top under{' '}
        <strong style={{ color: ae.text }}>Open Shelters</strong>{' '}with live status and capacity.
        Everything else is a <strong style={{ color: ae.text }}>potential site</strong>: a place
        that could open as a shelter, not a confirmed one.
      </p>
      <p style={{ ...textBody(ae), marginTop: 10 }}>
        Potential sites come from{' '}
        <a
          href="https://www.openstreetmap.org/"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          OpenStreetMap
        </a>{' '}
        and the{' '}
        <a
          href="https://nces.ed.gov/ccd/"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          NCES public-school database
        </a>
        : community centers, schools, churches, and other large buildings that could take in
        evacuees.
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 12,
          background: `rgba(${AMBER_RGB}, 0.05)`,
          border: `0.5px solid rgba(${AMBER_RGB}, 0.28)`,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: AMBER,
            boxShadow: `0 0 8px ${AMBER}`,
            marginTop: 5,
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontFamily: ae.fontDisplay, fontSize: 14, fontWeight: 700, color: AMBER }}>
            Call ahead during a real emergency
          </div>
          <p style={{ ...textBody(ae), marginTop: 4 }}>
            A potential site isn&apos;t guaranteed to be open or accepting evacuees. Call ahead, or
            check with your local emergency management office, before driving there.
          </p>
        </div>
      </div>

      <Section ae={ae} title="What the distance means">
        <p style={textBody(ae)}>
          The distance shown is a <strong style={{ color: ae.text }}>straight line</strong>{' '}between
          you and the shelter. The actual drive is longer, sometimes much longer if roads near the
          fire are closed. <strong style={{ color: ae.text }}>Get Directions</strong>{' '}opens Google
          Maps, which finds the real route.
        </p>
      </Section>

      <Section ae={ae} title="What's left out">
        <p style={textBody(ae)}>
          Places that are clearly too small, such as private homes or single-room businesses, are
          left out. So is any school in the fire&apos;s likely path. The list is sorted by distance
          from your location.
        </p>
      </Section>
    </Modal>
  );
}

const linkStyle: React.CSSProperties = { color: RISK_LEVELS.low.color, textDecoration: 'none' };

function Section({ ae, title, children }: { ae: ReturnType<typeof useAesthetic>['ae']; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: ae.fontDisplay,
          fontSize: 14,
          fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking,
          color: ae.text,
          paddingBottom: 6,
          borderBottom: `0.5px solid ${ae.lineStrong}`,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function textBody(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return {
    margin: 0,
    fontFamily: ae.fontBody,
    fontSize: 14,
    lineHeight: 1.6,
    color: ae.textDim,
  };
}

'use client';

// Opens from an info icon next to "Nearest Shelter" segment in EvacuationCard.
// Important caveats — these aren't official Red Cross shelters; they're
// community-tagged OSM data + NCES school records.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

const AMBER = '#E8B339';

export function ShelterInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Shelters" title="About these shelter locations" maxWidth={560}>
      <p style={textBody(ae)}>
        When shelters are reported <strong style={{ color: ae.text }}>open</strong> by emergency
        management or the Red Cross, they appear at the top under <strong style={{ color: ae.text }}>Open
        Shelters</strong> with live status and capacity. Everything else is a{' '}
        <strong style={{ color: ae.text }}>candidate</strong> — a potential evacuation point, not a
        confirmed open site.
      </p>
      <p style={{ ...textBody(ae), marginTop: 10 }}>
        Candidates are drawn from community-tagged{' '}
        <a
          href="https://www.openstreetmap.org/"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          OpenStreetMap
        </a>{' '}
        data and the{' '}
        <a
          href="https://nces.ed.gov/ccd/"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          NCES public-school database
        </a>{' '}
        — community centers, schools, churches, and similar large buildings that can plausibly
        host displaced households.
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 12,
          background: 'rgba(232, 179, 57, 0.05)',
          border: `0.5px solid rgba(232, 179, 57, 0.28)`,
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
            Candidate facilities aren&apos;t guaranteed to be open or accepting evacuees — confirm
            by phone or with your local emergency-management office before driving there. Shelters
            open on local EM and Red Cross decisions, often without any federal disaster
            declaration.
          </p>
        </div>
      </div>

      <Section ae={ae} title="What the distance means">
        <p style={textBody(ae)}>
          The distance shown is the <strong style={{ color: ae.text }}>straight-line</strong>{' '}
          (great-circle) distance between you and the shelter. Driving distance can be 1.3–2×
          higher in mountainous terrain or 1.5×+ if a direct road is closed by the fire. The{' '}
          <Mono ae={ae}>Get Directions</Mono> button hands off to Google Maps which figures out
          the actual route.
        </p>
      </Section>

      <Section ae={ae} title="Filtered out for safety">
        <p style={textBody(ae)}>
          We drop OSM tagged points that are obviously too small (private homes, single-room
          businesses) and any school within the fire&apos;s 12-hour spread cone. The list is
          sorted by straight-line distance from your active location.
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

function Mono({ ae, children }: { ae: ReturnType<typeof useAesthetic>['ae']; children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: ae.fontMono,
        fontSize: 12,
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '1px 6px',
        borderRadius: 4,
        border: `0.5px solid ${ae.line}`,
        color: ae.text,
      }}
    >
      {children}
    </code>
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

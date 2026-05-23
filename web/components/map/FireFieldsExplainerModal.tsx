'use client';

// Opens from an info icon on the Map screen's right-rail header.
// Explains the difference between satellite detections vs named incidents,
// and what each field on an incident card means.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

export function FireFieldsExplainerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Live Map" title="What you&apos;re looking at" maxWidth={620}>
      <p style={textBody(ae)}>
        The Live Map combines two completely different data sources: real-time satellite
        thermal-anomaly detections and human-curated incident records. They overlap but they
        aren&apos;t the same thing.
      </p>

      <Section ae={ae} title="Satellite detections (NASA FIRMS)">
        <p style={textBody(ae)}>
          Polar-orbiting satellites (Suomi NPP, NOAA-20, Aqua, Terra) detect thermal anomalies on
          the ground and publish them through{' '}
          <a
            href="https://firms.modaps.eosdis.nasa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            NASA FIRMS
          </a>
          . Each detection is a single ~375m or ~1km pixel with brightness, fire-radiative power
          (FRP), and confidence. They&apos;re fast but not very contextual — no name, no
          containment, no cause.
        </p>
        <Bullet ae={ae} k="Detection lag" v="Roughly 1–4 hours from observation to publication. Don&apos;t use FIRMS to decide whether to evacuate." />
        <Bullet ae={ae} k="What counts as &quot;confident&quot;" v="Filter out low-confidence detections during fog/smoke events — they include false positives from gas flares and industrial heat." />
      </Section>

      <Section ae={ae} title="Named incidents (NIFC + Cal Fire)">
        <p style={textBody(ae)}>
          Cards in the right rail come from <strong style={{ color: ae.text }}>NIFC</strong>{' '}
          (National Interagency Fire Center) and <strong style={{ color: ae.text }}>Cal Fire</strong>{' '}
          incident feeds. These are tracked fires that incident management teams have actually
          identified, named, and are managing.
        </p>
        <Bullet ae={ae} k="Acres" v="Total area inside the perimeter — not just actively burning. Updated when ground crews remap." />
        <Bullet ae={ae} k="Containment %" v="Percentage of perimeter where crews are confident the fire won&apos;t cross. Not the same as &quot;put out&quot;." />
        <Bullet ae={ae} k="Personnel" v="People assigned to the incident. Excludes off-shift, support, and aviation crews." />
        <Bullet ae={ae} k="Cause" v="Lightning, equipment, undetermined, etc. Often &quot;Under investigation&quot; for days." />
      </Section>

      <Section ae={ae} title="The severity color isn&apos;t official">
        <p style={textBody(ae)}>
          The red/orange/amber tint on each marker is{' '}
          <strong style={{ color: ae.text }}>synthesized</strong> from distance + acreage — a
          local shorthand for &quot;how much should you care?&quot; not a published incident
          severity rating. Officially, only the FEMA banner and any active evacuation orders
          from local authorities carry weight.
        </p>
      </Section>
    </Modal>
  );
}

const linkStyle: React.CSSProperties = { color: RISK_LEVELS.low.color, textDecoration: 'none' };

function Section({ ae, title, children }: { ae: ReturnType<typeof useAesthetic>['ae']; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: ae.fontDisplay,
          fontSize: 15,
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

function Bullet({ ae, k, v }: { ae: ReturnType<typeof useAesthetic>['ae']; k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: 99,
          background: ae.textMute,
          marginTop: 8,
          flexShrink: 0,
        }}
      />
      <div>
        <span style={{ fontFamily: ae.fontDisplay, fontSize: 13.5, fontWeight: 600, color: ae.text }}>{k}</span>
        <span style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, marginLeft: 6, lineHeight: 1.55 }}>
          — {v}
        </span>
      </div>
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

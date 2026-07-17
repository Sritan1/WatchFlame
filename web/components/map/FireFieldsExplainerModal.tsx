'use client';

// Opens from an info icon on the Map screen's right-rail header.
// Explains the difference between satellite detections vs named incidents,
// and what each field on an incident card means.

import { FlameGlyph, IncidentGlyph } from '@/components/map/marker-glyphs';
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
      {/* Visual key — which marker is which, before the words. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '16px 18px',
          marginBottom: 20,
          borderRadius: ae.radius,
          border: `0.5px solid ${ae.lineStrong}`,
          background: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            color: ae.textMute,
          }}
        >
          Map key
        </div>
        <KeyRow ae={ae} label="Satellite detection" desc="A NASA FIRMS heat pixel">
          <FlameGlyph height={28} />
        </KeyRow>
        <KeyRow ae={ae} label="Named incident" desc="A fire crews have named and are managing">
          <IncidentGlyph severity="extreme" size={16} />
        </KeyRow>
      </div>

      <p style={textBody(ae)}>
        The Live Map shows two different kinds of fire data: satellite detections and named
        incidents. They often point to the same fire, but they are not the same thing.
      </p>

      <Section ae={ae} title="Satellite detections (NASA FIRMS)">
        <p style={textBody(ae)}>
          NASA satellites detect heat on the ground and report it through{' '}
          <a
            href="https://firms.modaps.eosdis.nasa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            NASA FIRMS
          </a>
          . Each detection is a single pixel on the map, with a brightness and a confidence level.
          These arrive fast, but they carry no detail: no name, no size, no containment.
        </p>
        <Bullet ae={ae} k="Detection lag" v="A detection can be 1 to 4 hours old by the time it appears. Never rely on it to decide whether to evacuate." />
        <Bullet ae={ae} k="Confidence" v="Low-confidence detections can be false alarms from sources such as gas flares or industrial heat, especially in fog or smoke." />
      </Section>

      <Section ae={ae} title="Named incidents (NIFC + Cal Fire)">
        <p style={textBody(ae)}>
          Named incidents come from <strong style={{ color: ae.text }}>NIFC</strong>{' '}
          (the National Interagency Fire Center) and <strong style={{ color: ae.text }}>Cal Fire</strong>.
          These are real fires that crews have identified, named, and are actively managing.
        </p>
        <Bullet ae={ae} k="Acres" v="Total area inside the fire&apos;s edge, not just what is actively burning. It updates as crews remap the fire&apos;s edge." />
        <Bullet ae={ae} k="Containment %" v="The share of the fire&apos;s edge where crews are confident it will not spread. It does not mean the fire is out." />
        <Bullet ae={ae} k="Personnel" v="The number of people assigned to the fire." />
        <Bullet ae={ae} k="Cause" v="What started the fire, such as lightning or equipment. It often reads &quot;Under investigation&quot; for days." />
      </Section>

      <Section ae={ae} title="The severity color isn&apos;t official">
        <p style={textBody(ae)}>
          The red, orange, and amber colors on each marker are a quick shorthand for how much a fire
          might affect you, based on how close and how large it is. They are not an official severity
          rating. For that, rely on the FEMA banner and any evacuation orders from local authorities.
        </p>
      </Section>

      <Section ae={ae} title="How this feeds your Active Fire Threat">
        <p style={textBody(ae)}>
          On the Status page, your <strong style={{ color: ae.text }}>Active Fire Threat</strong>{' '}is
          based on the one fire near you that matters most: how close it is, how big it is, the wind
          direction, and how contained it is. The Threat Source card names that fire. Only fires
          within about 50 miles count, and the closer ones matter far more. A satellite detection
          within 3 miles of a named incident is treated as the same fire.
        </p>
      </Section>
    </Modal>
  );
}

const linkStyle: React.CSSProperties = { color: RISK_LEVELS.low.color, textDecoration: 'none' };

function KeyRow({
  ae,
  label,
  desc,
  children,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 40, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {children}
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: ae.fontDisplay, fontSize: 14, fontWeight: 600, color: ae.text }}>
          {label}
        </span>
        <span style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, marginLeft: 6, lineHeight: 1.55 }}>
          · {desc}
        </span>
      </div>
    </div>
  );
}

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
          · {v}
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

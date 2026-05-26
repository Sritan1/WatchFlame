'use client';

// Emergency contacts list. Mock data baked in for now — would come from a
// user-profile store once we have auth.

import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';

const BLUE = '#4FA8FF';
const BLUE_RGB = '79, 168, 255';

interface Contact {
  name: string;
  rel: string;
  phone: string;
  tag: string;
}

const CONTACTS: Contact[] = [
  { name: 'M. Murakami',      rel: 'Spouse',          phone: '510-555-0182', tag: 'ICE 1' },
  { name: 'Berkeley Fire',    rel: 'Local',           phone: '510-981-5500', tag: 'Fire' },
  { name: 'CA Out-of-State',  rel: 'Sister · Reno',   phone: '775-555-0224', tag: 'OOS' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function ContactsCard() {
  const { ae } = useAesthetic();
  return (
    <div
      className="ember-card ember-card-hover"
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 20,
      }}
    >
      <SectionEyebrow>Emergency Contacts</SectionEyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {CONTACTS.map((c, i) => (
          <a
            key={c.name}
            href={`tel:${c.phone.replace(/-/g, '')}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < CONTACTS.length - 1 ? `0.5px solid ${ae.line}` : 'none',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 99,
                background: `linear-gradient(135deg, rgba(${BLUE_RGB}, 0.18), rgba(${BLUE_RGB}, 0.06))`,
                border: `0.5px solid rgba(${BLUE_RGB}, 0.25)`,
                color: BLUE,
                fontFamily: ae.fontDisplay,
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '0.02em',
              }}
            >
              {initials(c.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 14,
                  fontWeight: 600,
                  color: ae.text,
                  letterSpacing: ae.titleTracking,
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontFamily: ae.fontMono,
                  fontSize: 10.5,
                  color: ae.textMute,
                  letterSpacing: '0.04em',
                }}
              >
                {c.rel} · {c.phone}
              </div>
            </div>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.04)',
                border: `0.5px solid ${ae.line}`,
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 600,
                color: ae.textDim,
                letterSpacing: '0.12em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {c.tag}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

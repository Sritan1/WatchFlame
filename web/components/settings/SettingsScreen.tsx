'use client';

// Settings page — Aesthetic switcher · Units · Important Notice · About + Data Sources.
// No auth/profile yet, so this is the limit of mutable preferences.

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { AESTHETICS, type AestheticId } from '@/lib/theme';
import { useUnits, type DistanceUnit, type SpeedUnit, type TempUnit } from '@/lib/use-units';

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';
const RED = '#F04438';

export function SettingsScreen() {
  const { ae, aestheticId, setAestheticId } = useAesthetic();
  const units = useUnits();

  return (
    <PageSection top={36} bottom={56}>
      <SectionEyebrow color={AMBER}>Settings · Preferences & Notices</SectionEyebrow>

      <h1
        style={{
          margin: 0,
          fontFamily: ae.fontDisplay,
          fontSize: 48,
          fontWeight: ae.titleWeight,
          letterSpacing: '-0.025em',
          color: ae.text,
          lineHeight: 1.0,
        }}
      >
        Settings
      </h1>
      <p
        style={{
          margin: '14px 0 32px',
          maxWidth: 720,
          fontFamily: ae.fontBody,
          fontSize: 16,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        Preferences are saved to this browser only — no account needed. The disclaimer below
        applies to every screen.
      </p>

      {/* Aesthetic */}
      <Card ae={ae}>
        <CardHeader ae={ae} eyebrow="Visual tone">
          <h2 style={cardTitleStyle(ae)}>Aesthetic</h2>
          <p style={cardSubStyle(ae)}>
            Switch between three coordinated dark themes. Affects radii, font weight, and chip casing.
          </p>
        </CardHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {(['gov', 'startup', 'tactical'] as AestheticId[]).map((id) => {
            const a = AESTHETICS[id];
            const active = aestheticId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAestheticId(id)}
                style={{
                  padding: 16,
                  borderRadius: ae.radius,
                  border: `0.5px solid ${active ? ae.lineStrong : ae.line}`,
                  background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    color: ae.textMute,
                    textTransform: 'uppercase',
                  }}
                >
                  {id}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: ae.fontDisplay,
                    fontSize: 15,
                    fontWeight: 600,
                    color: active ? ae.text : ae.textDim,
                    letterSpacing: ae.titleTracking,
                  }}
                >
                  {a.name}
                </div>
                {active ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      width: 18,
                      height: 18,
                      borderRadius: 99,
                      background: 'rgba(126, 231, 135, 0.16)',
                      border: '0.5px solid rgba(126, 231, 135, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="check" size={11} color="#7ee787" strokeWidth={2.5} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Units */}
      <Card ae={ae}>
        <CardHeader ae={ae} eyebrow="Units">
          <h2 style={cardTitleStyle(ae)}>Display units</h2>
          <p style={cardSubStyle(ae)}>
            Distances, wind speeds, and temperatures across Command Center, Live Map, Risk Forecast,
            Safety Plan, and the Full Details page all respect these.
          </p>
        </CardHeader>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <UnitRow<TempUnit>
            label="Temperature"
            current={units.temp}
            options={[
              { v: 'C', l: '°C' },
              { v: 'F', l: '°F' },
            ]}
            onChange={units.setTemp}
            ae={ae}
          />
          <UnitRow<SpeedUnit>
            label="Wind speed"
            current={units.speed}
            options={[
              { v: 'kph', l: 'kph' },
              { v: 'mph', l: 'mph' },
            ]}
            onChange={units.setSpeed}
            ae={ae}
          />
          <UnitRow<DistanceUnit>
            label="Distance"
            current={units.distance}
            options={[
              { v: 'mi', l: 'mi' },
              { v: 'km', l: 'km' },
            ]}
            onChange={units.setDistance}
            ae={ae}
          />
        </div>
      </Card>

      {/* Important notice */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${AMBER_RGB}, 0.28)`,
          borderRadius: ae.radiusLg,
          boxShadow: `0 20px 50px rgba(${AMBER_RGB}, 0.10), inset 0 1px 0 rgba(255,255,255,0.05)`,
          marginTop: 20,
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Icon name="warn" size={16} color={AMBER} strokeWidth={1.8} />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: AMBER,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Important Notice
          </span>
        </div>
        <h2
          style={{
            margin: '6px 0 0',
            fontFamily: ae.fontDisplay,
            fontSize: 22,
            fontWeight: ae.titleWeight,
            color: ae.text,
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
          }}
        >
          This is an informational tool, not an emergency service.
        </h2>
        <p
          style={{
            marginTop: 12,
            fontFamily: ae.fontBody,
            fontSize: 14,
            lineHeight: 1.6,
            color: ae.textDim,
          }}
        >
          In an active emergency, call <strong style={{ color: RED, fontWeight: 700 }}>911</strong> and follow
          evacuation orders from local authorities. Do not rely on this app to make
          life-safety decisions.
        </p>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            {
              t: 'Cross-check with official sources',
              b: 'The National Weather Service (weather.gov), your state forestry / Cal Fire site, ready.gov, and your county emergency-management office are authoritative. This app is not.',
            },
            {
              t: 'Detection delays exist',
              b: 'NASA satellite detections (FIRMS) lag the real fire by 1–2 hours. Named-incident metadata from NIFC and Cal Fire is updated on each agency’s own schedule and may also be delayed.',
            },
            {
              t: 'The risk score is an approximation',
              b: 'A public-data fire-weather index calibrated against historical fire records. It is not a substitute for professional fire-weather services like the NWS Storm Prediction Center.',
            },
            {
              t: 'Shelters listed may not be activated',
              b: 'Listings come from community-tagged OpenStreetMap data and the NCES public-school database. They are potential evacuation points — call ahead during a real emergency.',
            },
            {
              t: 'Project context',
              b: 'This is a personal portfolio project, not a commercial product. There is no SLA, no guarantee of accuracy, and no on-call team.',
            },
          ].map((it) => (
            <div key={it.t} style={{ display: 'flex', gap: 10 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  background: RED,
                  marginTop: 8,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 14,
                    fontWeight: 700,
                    color: ae.text,
                    letterSpacing: ae.titleTracking,
                  }}
                >
                  {it.t}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: ae.fontBody,
                    fontSize: 13,
                    color: ae.textDim,
                    lineHeight: 1.5,
                  }}
                >
                  {it.b}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <Card ae={ae}>
        <CardHeader ae={ae} eyebrow="About">
          <h2 style={cardTitleStyle(ae)}>Data sources</h2>
        </CardHeader>
        <p style={{ margin: 0, fontFamily: ae.fontBody, fontSize: 13.5, lineHeight: 1.6, color: ae.textDim }}>
          Real-time satellite fire detections from <strong style={{ color: ae.text }}>NASA FIRMS</strong>.
          Active incident metadata from <strong style={{ color: ae.text }}>NIFC</strong> and{' '}
          <strong style={{ color: ae.text }}>Cal Fire</strong>. Current conditions from{' '}
          <strong style={{ color: ae.text }}>OpenWeatherMap</strong>. Risk score is a transparent
          rule-based fire-weather index based on Fosberg, Hot-Dry-Windy, and McArthur indices.
          Federal disaster declarations from <strong style={{ color: ae.text }}>FEMA</strong>.
          Map tiles by <strong style={{ color: ae.text }}>MapTiler</strong> with{' '}
          <strong style={{ color: ae.text }}>OpenStreetMap</strong> data.
        </p>
      </Card>
    </PageSection>
  );
}

// ─── Internal layout helpers ────────────────────────────────────────────────

function Card({ ae, children }: { ae: ReturnType<typeof useAesthetic>['ae']; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 20,
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  ae,
  eyebrow,
  children,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

const cardTitleStyle = (ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties => ({
  margin: 0,
  fontFamily: ae.fontDisplay,
  fontSize: 20,
  fontWeight: ae.titleWeight,
  letterSpacing: ae.titleTracking,
  color: ae.text,
});

const cardSubStyle = (ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties => ({
  margin: '6px 0 0',
  fontFamily: ae.fontBody,
  fontSize: 13,
  lineHeight: 1.45,
  color: ae.textDim,
});

function UnitRow<T extends string>({
  label,
  current,
  options,
  onChange,
  ae,
}: {
  label: string;
  current: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  ae: ReturnType<typeof useAesthetic>['ae'];
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: ae.fontDisplay,
          fontSize: 13,
          fontWeight: 600,
          color: ae.text,
          letterSpacing: ae.titleTracking,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${options.length}, 1fr)`,
          gap: 4,
          padding: 4,
          borderRadius: ae.radius,
          background: 'rgba(0, 0, 0, 0.30)',
          border: `0.5px solid ${ae.line}`,
        }}
      >
        {options.map((o) => {
          const active = current === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              style={{
                height: 36,
                borderRadius: ae.radius - 4,
                border: 'none',
                background: active
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))'
                  : 'transparent',
                color: active ? ae.text : ae.textMute,
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.10em',
                cursor: 'pointer',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

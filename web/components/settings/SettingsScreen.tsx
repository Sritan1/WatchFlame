'use client';

// Settings page — Aesthetic switcher · Units · Important Notice · About + Data Sources.
// Two-column inspector pattern: each section is a SettingsRow with a narrow
// header rail (eyebrow + title + description + key/value meta) and a wide
// control well. Important Notice + About are full-bleed variants.
// No auth/profile yet, so this is the limit of mutable preferences.

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { PageSection } from '@/components/ui/PageSection';
import { useAesthetic } from '@/lib/aesthetic';
import { AESTHETICS, type Aesthetic, type AestheticId } from '@/lib/theme';
import { useUnits, type DistanceUnit, type SpeedUnit, type TempUnit } from '@/lib/use-units';

type AE = Aesthetic;

// Chrome accent matches the floating sidebar/topbar — peach orange.
const CHROME = '#FFA76A';
const CHROME_RGB = '255, 167, 106';

// Important Notice tone (amber warn).
const WARN = '#E8B339';
const WARN_RGB = '232, 179, 57';

// 911 callout.
const RED = '#F04438';

export function SettingsScreen() {
  const { ae, aestheticId, setAestheticId } = useAesthetic();
  const units = useUnits();

  return (
    <div style={{ background: ae.bg, paddingBottom: 48 }}>
      <PageSection top={28} bottom={32} maxWidth={1200}>
        {/* ───── Page header ───────────────────────────────────── */}
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: WARN,
                  boxShadow: `0 0 10px ${WARN}, 0 0 3px ${WARN}`,
                  animation: 'ember-flicker 2.4s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.20em',
                  color: WARN,
                  textTransform: 'uppercase',
                }}
              >
                Settings · Preferences &amp; Notices
              </span>
            </div>
            <span
              style={{
                flex: 1,
                height: 1,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)',
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                color: ae.textMute,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Local · No account
            </span>
          </div>

          <h1
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 56,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.028em',
              margin: '0 0 10px',
              color: ae.text,
              lineHeight: 1.02,
            }}
          >
            Settings
          </h1>
          <p
            style={{
              color: ae.textDim,
              fontSize: 15.5,
              lineHeight: 1.55,
              margin: 0,
              maxWidth: 640,
            }}
          >
            Preferences are saved to this browser only — no account needed. The disclaimer below applies to every screen.
          </p>
        </header>

        {/* ───── Aesthetic ─────────────────────────────────────── */}
        <SettingsRow
          ae={ae}
          eyebrow="Visual tone"
          eyebrowIcon="layers"
          accentRgb={CHROME_RGB}
          title="Aesthetic"
          description="Switch between three coordinated dark themes. Affects radii, font weight, and chip casing."
          meta={[
            { label: 'Active', value: AESTHETICS[aestheticId].name },
            { label: 'Scope', value: 'All screens' },
          ]}
        >
          <div
            className="app-stack"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {(
              [
                { value: 'gov', tag: 'GOV', label: 'Government utility' },
                { value: 'startup', tag: 'STUDIO', label: 'Modern studio' },
                { value: 'tactical', tag: 'TACTICAL', label: 'Tactical instrument' },
              ] as { value: AestheticId; tag: string; label: string }[]
            ).map((o) => (
              <AestheticOption
                key={o.value}
                ae={ae}
                value={o.value}
                tag={o.tag}
                label={o.label}
                selected={aestheticId === o.value}
                onClick={() => setAestheticId(o.value)}
                accentRgb={CHROME_RGB}
              />
            ))}
          </div>
        </SettingsRow>

        {/* ───── Units ─────────────────────────────────────────── */}
        <SettingsRow
          ae={ae}
          eyebrow="Units"
          eyebrowIcon="crosshair"
          accentRgb={CHROME_RGB}
          alignCenter
          title="Display units"
          description="Distances, wind speeds, and temperatures across Status, Live Map, Fire-Weather What-If, Safety Plan, and the full report page all respect these."
          meta={[
            { label: 'Locale', value: 'Auto · US' },
            { label: 'Conversion', value: 'Live' },
          ]}
        >
          <div
            style={{
              display: 'grid',
              // Each toggle is capped at 200px and the leftover desktop width is
              // distributed BETWEEN them, so on a wide well they spread evenly
              // across the row instead of stretching to ~300px (sparse) or
              // clustering on the left. On a phone the well is narrower than
              // 3×200, so the tracks shrink to fill it (no leftover → the
              // space-between is a no-op) and the toggles fill the width exactly
              // as before.
              gridTemplateColumns: 'repeat(3, minmax(0, 200px))',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Segmented<TempUnit>
              ae={ae}
              label="Temperature"
              accentRgb={CHROME_RGB}
              value={units.temp}
              options={[
                { value: 'C', label: '°C' },
                { value: 'F', label: '°F' },
              ]}
              onChange={units.setTemp}
            />
            <Segmented<SpeedUnit>
              ae={ae}
              label="Wind speed"
              accentRgb={CHROME_RGB}
              value={units.speed}
              options={[
                { value: 'kph', label: 'KPH' },
                { value: 'mph', label: 'MPH' },
              ]}
              onChange={units.setSpeed}
            />
            <Segmented<DistanceUnit>
              ae={ae}
              label="Distance"
              accentRgb={CHROME_RGB}
              value={units.distance}
              options={[
                { value: 'mi', label: 'MI' },
                { value: 'km', label: 'KM' },
              ]}
              onChange={units.setDistance}
            />
          </div>
        </SettingsRow>

        {/* ───── Important Notice (full-bleed) ─────────────────── */}
        <SettingsRow
          ae={ae}
          fullBleed
          eyebrow="Important notice"
          eyebrowIcon="warn"
          eyebrowColor={WARN}
          accentRgb={WARN_RGB}
          title="This is an informational tool, not an emergency service."
        >
          <p
            style={{
              color: ae.textDim,
              fontSize: 14,
              lineHeight: 1.65,
              margin: '14px 0 0',
              maxWidth: 720,
            }}
          >
            In an active emergency, call{' '}
            <span
              style={{
                color: RED,
                fontWeight: 700,
                fontFamily: ae.fontDisplay,
                letterSpacing: '-0.01em',
                padding: '0 4px',
              }}
            >
              911
            </span>{' '}
            and follow evacuation orders from local authorities. Do not rely on this app to make life-safety decisions.
          </p>

          <div style={{ marginTop: 10 }}>
            <NoticeBullet
              ae={ae}
              num={1}
              accentRgb={WARN_RGB}
              title="Cross-check with official sources"
              body="The National Weather Service (weather.gov), your state forestry / Cal Fire site, ready.gov, and your county emergency-management office are authoritative. This app is not."
            />
            <NoticeBullet
              ae={ae}
              num={2}
              accentRgb={WARN_RGB}
              title="Detection delays exist"
              body="NASA satellite detections (FIRMS) lag the real fire by roughly 1–4 hours. Named-incident metadata from NIFC and Cal Fire is updated on each agency's own schedule and may also be delayed."
            />
            <NoticeBullet
              ae={ae}
              num={3}
              accentRgb={WARN_RGB}
              title="The risk score is an approximation"
              body="A public-data fire-weather index calibrated against historical fire records. It is not a substitute for professional fire-weather services like the NWS Storm Prediction Center."
            />
            <NoticeBullet
              ae={ae}
              num={4}
              accentRgb={WARN_RGB}
              title="Shelters: open vs. potential"
              body="Open shelters reported by the FEMA National Shelter System appear with live status and capacity. Everything else is a potential evacuation point drawn from OpenStreetMap and the NCES public-school database — not a confirmed open site. Call ahead during a real emergency."
            />
            <NoticeBullet
              ae={ae}
              num={5}
              accentRgb={WARN_RGB}
              title="What this is"
              body="An independent, informational tool — not a commercial or operational emergency service. It comes with no guarantees of uptime or accuracy, and there's no team monitoring it around the clock."
            />
          </div>
          <p
            style={{
              marginTop: 14,
              fontFamily: ae.fontMono,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: ae.textDim,
            }}
          >
            Full details:{' '}
            <Link href="/terms" style={{ color: WARN }}>Terms of Use</Link>
            {' · '}
            <Link href="/privacy" style={{ color: WARN }}>Privacy Policy</Link>
            {' · '}
            <Link href="/accessibility" style={{ color: WARN }}>Accessibility</Link>
          </p>
        </SettingsRow>

        {/* ───── Data sources (full-bleed) ─────────────────────── */}
        <SettingsRow
          ae={ae}
          fullBleed
          eyebrow="About"
          eyebrowIcon="info"
          accentRgb={CHROME_RGB}
          title="Data sources"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 10,
              marginTop: 6,
              marginBottom: 22,
            }}
          >
            <SourceChip ae={ae} code="NASA FIRMS" kind="Satellite" label="Real-time fire detections" />
            <SourceChip ae={ae} code="NIFC" kind="Incidents" label="Named incident metadata" />
            <SourceChip ae={ae} code="Cal Fire" kind="Incidents" label="California operations" />
            <SourceChip ae={ae} code="OpenWeatherMap" kind="Weather" label="Current conditions" />
            <SourceChip ae={ae} code="Open-Meteo" kind="Weather" label="Drought (KBDI) history" />
            <SourceChip ae={ae} code="Copernicus" kind="Satellite" label="Sentinel-2 vegetation (NDVI)" />
            <SourceChip ae={ae} code="US Census" kind="Geodata" label="State / county lookup" />
            <SourceChip ae={ae} code="FEMA" kind="Federal" label="Disasters & open shelters" />
            <SourceChip ae={ae} code="MapTiler" kind="Cartography" label="Map tiles" />
            <SourceChip ae={ae} code="OpenStreetMap" kind="Geodata" label="Base map & POI" />
            <SourceChip ae={ae} code="NCES" kind="Public DB" label="School database" />
            <SourceChip ae={ae} code="NLCD" kind="Land cover" label="Fuel type (ignition model)" />
            <SourceChip ae={ae} code="FPA-FOD" kind="Historical" label="Fire records (calibration)" />
          </div>

          <p
            style={{
              color: ae.textDim,
              fontSize: 13.8,
              lineHeight: 1.7,
              margin: 0,
              maxWidth: 820,
            }}
          >
            Real-time satellite fire detections from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>NASA FIRMS</strong>. Active incident metadata from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>NIFC</strong>{' '}and{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>Cal Fire</strong>. Current conditions from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>OpenWeatherMap</strong>, with drought (KBDI) history from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>Open-Meteo</strong>{' '}and live vegetation stress (NDVI) from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>Copernicus Sentinel-2</strong>. The risk score is a transparent rule-based fire-weather index, based on the Fosberg, Hot-Dry-Windy, and McArthur indices, calibrated per state against historical fire records (<strong style={{ color: ae.text, fontWeight: 600 }}>FPA-FOD</strong>), using{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>US Census</strong>{' '}geographies. The machine-learning ignition model also reads land cover (fuel type) from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>NLCD / EnviroAtlas</strong>. Federal disaster declarations and open shelters from{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>FEMA</strong>. Map tiles by{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>MapTiler</strong>{' '}with{' '}
            <strong style={{ color: ae.text, fontWeight: 600 }}>OpenStreetMap</strong>{' '}data.
          </p>

          {/* Required attributions / licenses for third-party data sources. */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: `0.5px solid ${ae.line}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontFamily: ae.fontBody,
              fontSize: 12,
              lineHeight: 1.6,
              color: ae.textMute,
              maxWidth: 820,
            }}
          >
            <div>Contains modified Copernicus Sentinel data 2026.</div>
            <div>
              Weather data by{' '}
              <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" style={{ color: ae.textDim, textDecoration: 'underline' }}>Open-Meteo</a>{' '}
              (CC BY 4.0) and{' '}
              <a href="https://openweathermap.org" target="_blank" rel="noopener noreferrer" style={{ color: ae.textDim, textDecoration: 'underline' }}>OpenWeather</a>.
            </div>
            <div>
              Map data ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: ae.textDim, textDecoration: 'underline' }}>OpenStreetMap contributors</a>, tiles by{' '}
              <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer" style={{ color: ae.textDim, textDecoration: 'underline' }}>MapTiler</a>.
            </div>
            <div>This product uses the FEMA OpenFEMA API, but is not endorsed by FEMA.</div>
          </div>
        </SettingsRow>

        {/* ───── Footer build line ─────────────────────────────── */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 22,
            borderTop: `0.5px solid ${ae.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.20em',
                color: ae.textDim,
                textTransform: 'uppercase',
              }}
            >
              Ember Watch
            </span>
            <FooterDot ae={ae} />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textMute,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Built 2026
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(['FIRMS', 'NIFC', 'CAL FIRE', 'OWM', 'OPEN-METEO', 'CDSE', 'CENSUS', 'FEMA', 'OSM', 'NCES'] as const).map(
              (s, i, arr) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      color: ae.textMute,
                      textTransform: 'uppercase',
                    }}
                  >
                    {s}
                  </span>
                  {i < arr.length - 1 && <FooterDot ae={ae} opacity={0.6} />}
                </div>
              ),
            )}
          </div>
        </div>
      </PageSection>
    </div>
  );
}

// ─── Internal layout helpers ────────────────────────────────────────────────

interface SettingsRowProps {
  ae: AE;
  eyebrow: string;
  eyebrowIcon?: IconName;
  eyebrowColor?: string;
  accentRgb?: string;
  title: string;
  description?: string;
  meta?: { label: string; value: string }[];
  children: ReactNode;
  fullBleed?: boolean;
  /** Vertically center the control well against the (taller) header rail
   *  instead of top-aligning it. Used when the control is short (e.g. the unit
   *  toggles) so it sits balanced beside the description rather than stranded
   *  at the top with a large blank space below. Desktop only — the grid is a
   *  single column on mobile, where alignItems has no effect. */
  alignCenter?: boolean;
}

function SettingsRow({
  ae,
  eyebrow,
  eyebrowIcon,
  eyebrowColor,
  accentRgb,
  title,
  description,
  meta,
  children,
  fullBleed,
  alignCenter,
}: SettingsRowProps) {
  const accent = accentRgb || '255, 255, 255';
  return (
    <section
      style={{
        position: 'relative',
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 50px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        marginBottom: 18,
      }}
    >
      {/* Top hairline highlight */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 28,
          right: 28,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="app-stack"
        style={{
          display: 'grid',
          gridTemplateColumns: fullBleed
            ? 'minmax(0, 1fr)'
            : 'minmax(200px, 240px) minmax(0, 1fr)',
          gap: fullBleed ? 0 : 36,
          padding: '28px 28px',
          alignItems: alignCenter ? 'center' : 'start',
        }}
      >
        {/* Header rail */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              marginBottom: 12,
            }}
          >
            {eyebrowIcon ? (
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  flexShrink: 0,
                  background: `linear-gradient(180deg, rgba(${accent}, 0.18), rgba(${accent}, 0.04))`,
                  border: `0.5px solid rgba(${accent}, 0.30)`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={eyebrowIcon}
                  size={10}
                  color={eyebrowColor || ae.textDim}
                  strokeWidth={2}
                />
              </span>
            ) : (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  flexShrink: 0,
                  background: eyebrowColor || ae.textDim,
                  boxShadow: eyebrowColor ? `0 0 8px ${eyebrowColor}` : 'none',
                }}
              />
            )}
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: eyebrowColor || ae.textDim,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {eyebrow}
            </span>
          </div>

          <h2
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 22,
              fontWeight: ae.titleWeight,
              letterSpacing: ae.titleTracking,
              margin: 0,
              color: ae.text,
              lineHeight: 1.22,
            }}
          >
            {title}
          </h2>

          {description && (
            <p
              style={{
                color: ae.textDim,
                fontSize: 13.5,
                lineHeight: 1.6,
                margin: '10px 0 0',
                maxWidth: 360,
              }}
            >
              {description}
            </p>
          )}

          {meta && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: `0.5px solid ${ae.line}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {meta.map((m) => (
                <div
                  key={m.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      color: ae.textMute,
                      textTransform: 'uppercase',
                    }}
                  >
                    {m.label}
                  </span>
                  <span
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 10.5,
                      color: ae.text,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Control well */}
        <div style={{ minWidth: 0, ...(fullBleed ? { marginTop: 18 } : {}) }}>{children}</div>
      </div>
    </section>
  );
}

interface AestheticOptionProps {
  ae: AE;
  value: AestheticId;
  tag: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  accentRgb: string;
}

function AestheticOption({
  ae,
  value,
  tag,
  label,
  selected,
  onClick,
  accentRgb,
}: AestheticOptionProps) {
  // The preview tile is rendered in the OPTION's own tokens so the card itself
  // demonstrates what selecting it would do — radii, font weight, chip casing.
  const opt = AESTHETICS[value];
  return (
    <button
      type="button"
      onClick={onClick}
      className="settings-aesthetic-card"
      data-selected={selected}
      style={{
        position: 'relative',
        background: selected
          ? `linear-gradient(180deg, rgba(${accentRgb}, 0.10), rgba(${accentRgb}, 0.02))`
          : ae.surface2,
        border: selected
          ? `0.5px solid rgba(${accentRgb}, 0.45)`
          : `0.5px solid ${ae.line}`,
        borderRadius: ae.radius,
        padding: 14,
        cursor: 'pointer',
        textAlign: 'left',
        color: ae.text,
        boxShadow: selected
          ? `0 0 0 1px rgba(${accentRgb}, 0.18), 0 14px 32px rgba(${accentRgb}, 0.10), inset 0 1px 0 rgba(255,255,255,0.05)`
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition:
          'background .22s ease, border-color .22s ease, box-shadow .22s ease, transform .15s ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 72,
          padding: 10,
          borderRadius: Math.max(opt.radius, 4),
          background: opt.bg,
          border: opt.cardBorder,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: Math.max(opt.radius - 2, 3),
            background: 'linear-gradient(135deg, rgba(255,122,58,0.45), rgba(255,122,58,0.10))',
            border: '0.5px solid rgba(255,122,58,0.35)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="flame" size={13} color="#FFB48E" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: opt.fontMono,
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: opt.textMute,
              textTransform: opt.chipUpper ? 'uppercase' : 'none',
              marginBottom: 3,
            }}
          >
            Risk · 04
          </div>
          <div
            style={{
              fontFamily: opt.fontDisplay,
              fontSize: 13.5,
              fontWeight: opt.titleWeight,
              letterSpacing: opt.titleTracking,
              color: opt.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Tilden Ridge
          </div>
        </div>
        <div
          style={{
            fontFamily: opt.fontDisplay,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: opt.text,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          72
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: ae.textMute,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {tag}
          </div>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: ae.titleTracking,
              color: ae.text,
              lineHeight: 1.25,
            }}
          >
            {label}
          </div>
        </div>

        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 99,
            flexShrink: 0,
            background: selected ? `rgba(${accentRgb}, 0.20)` : 'transparent',
            border: selected
              ? `0.5px solid rgba(${accentRgb}, 0.50)`
              : `0.5px solid ${ae.line}`,
            boxShadow: selected ? `0 0 10px rgba(${accentRgb}, 0.35)` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all .2s ease',
          }}
        >
          {selected && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke={`rgb(${accentRgb})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5 9-11" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  ae: AE;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accentRgb: string;
}

function Segmented<T extends string>({
  ae,
  label,
  options,
  value,
  onChange,
  accentRgb,
}: SegmentedProps<T>) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const wPct = 100 / options.length;
  return (
    <div>
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: 'uppercase',
          marginBottom: 9,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: `repeat(${options.length}, 1fr)`,
          background: ae.surface2,
          border: `0.5px solid ${ae.line}`,
          borderRadius: ae.radius,
          padding: 3,
          boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.20)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: `calc(${idx * wPct}% + 3px)`,
            width: `calc(${wPct}% - 6px)`,
            background: `linear-gradient(180deg, rgba(${accentRgb}, 0.30), rgba(${accentRgb}, 0.10))`,
            border: `0.5px solid rgba(${accentRgb}, 0.42)`,
            borderRadius: Math.max(ae.radius - 3, 4),
            boxShadow: `
              0 4px 14px rgba(${accentRgb}, 0.25),
              inset 0 1px 0 rgba(255,255,255,0.15),
              inset 0 -1px 0 rgba(0,0,0,0.15)
            `,
            transition: 'left .42s cubic-bezier(0.4, 1.3, 0.3, 1)',
          }}
        />

        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              style={{
                position: 'relative',
                zIndex: 1,
                padding: '11px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: active ? ae.text : ae.textMute,
                textTransform: 'uppercase',
                transition: 'color .22s ease',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface NoticeBulletProps {
  ae: AE;
  num: number;
  title: string;
  body: string;
  accentRgb: string;
}

function NoticeBullet({ ae, num, title, body, accentRgb }: NoticeBulletProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr',
        gap: 16,
        paddingTop: 18,
        paddingBottom: 18,
        borderTop: `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `linear-gradient(180deg, rgba(${accentRgb}, 0.14), rgba(${accentRgb}, 0.04))`,
          border: `0.5px solid rgba(${accentRgb}, 0.30)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(${accentRgb}, 0.15)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 700,
          color: `rgb(${accentRgb})`,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em',
        }}
      >
        {String(num).padStart(2, '0')}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 14.5,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: '4px 0 6px',
            color: ae.text,
          }}
        >
          {title}
        </h3>
        <p style={{ color: ae.textDim, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </div>
  );
}

interface SourceChipProps {
  ae: AE;
  code: string;
  label: string;
  kind: string;
}

function SourceChip({ ae, code, label, kind }: SourceChipProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 12px',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))',
        border: `0.5px solid ${ae.line}`,
        borderRadius: ae.radius,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: ae.text,
            textTransform: 'uppercase',
          }}
        >
          {code}
        </span>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: '0.16em',
            color: ae.textMute,
            textTransform: 'uppercase',
          }}
        >
          {kind}
        </span>
      </div>
      <span
        style={{
          fontFamily: ae.fontBody,
          fontSize: 11.5,
          color: ae.textDim,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function FooterDot({ ae, opacity = 1 }: { ae: AE; opacity?: number }) {
  const style: CSSProperties = {
    width: 3,
    height: 3,
    borderRadius: 99,
    background: ae.textMute,
    opacity,
  };
  return <span style={style} />;
}

'use client';

// "Immediate Preparation" — 6 prep actions with custom checkboxes, numeric
// index, time pill, and a ProgressArc header showing X/6 complete + remaining
// minutes. Matte-glass surface + roomy rows per the reference design.

import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { GLASS_CARD } from '@/components/safety/glass';
import { ProgressArc } from '@/components/ui/ProgressArc';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

interface ChecklistItem {
  id: string;
  label: string;
  time: string;
  /** Minutes used for "X min remaining" math. */
  minutes: number;
  desc: string;
}

const CHECKLIST: ChecklistItem[] = [
  { id: 'gobag',   label: "Pack emergency 'Go Bag'",          time: '20 min', minutes: 20, desc: 'IDs, meds, water, charger, flashlight, paper map.' },
  { id: 'devices', label: 'Charge all mobile devices',         time: '5 min',  minutes: 5,  desc: 'Phones, radios, battery packs to 100%.' },
  { id: 'windows', label: 'Close all windows and doors',       time: '10 min', minutes: 10, desc: 'Including pet doors, attic vents, garage.' },
  { id: 'gutters', label: 'Clear leaves from gutters',         time: '30 min', minutes: 30, desc: 'Remove combustible debris within 5 ft of home.' },
  { id: 'pets',    label: 'Confirm pets and family contacts',  time: '10 min', minutes: 10, desc: 'Carriers ready, emergency contacts saved, kids briefed.' },
  { id: 'meds',    label: 'Gather essential medications',      time: '5 min',  minutes: 5,  desc: '7-day supply of prescriptions and basics.' },
];

// Completion ticks read green (done = good), independent of the page's
// risk-driven section accent.
const GREEN = RISK_LEVELS.low;

export function ChecklistCard({ riskLevel }: { riskLevel: RiskLevel }) {
  const { ae, accent } = useAesthetic();
  const r = getRisk(riskLevel, accent);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const done = useMemo(() => CHECKLIST.filter((c) => checked[c.id]).length, [checked]);
  const remainingMin = useMemo(
    () => CHECKLIST.filter((c) => !checked[c.id]).reduce((sum, c) => sum + c.minutes, 0),
    [checked],
  );

  const toggle = (id: string) => setChecked((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{ ...GLASS_CARD, borderRadius: ae.radiusLg, overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="app-card-pad"
        style={{
          padding: '26px 30px 22px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.20em',
              color: r.color,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Before a fire
          </div>
          <h2
            style={{
              margin: '12px 0 9px',
              fontFamily: ae.fontDisplay,
              fontSize: 33,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.02em',
              color: ae.text,
              lineHeight: 1,
            }}
          >
            Immediate Preparation
          </h2>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 13,
              color: ae.textDim,
              letterSpacing: '0.02em',
            }}
          >
            {done}/{CHECKLIST.length} complete · ~{remainingMin} min remaining
          </div>
        </div>
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <ProgressArc value={done} total={CHECKLIST.length} color={r.color} size={86} />
        </div>
      </div>

      {/* Rows */}
      <div className="app-card-pad" style={{ padding: '0 30px 14px' }}>
        {CHECKLIST.map((it, i) => {
          const isChecked = !!checked[it.id];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggle(it.id)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '30px 28px 1fr 22px',
                gap: 18,
                alignItems: 'center',
                padding: '20px 10px 20px 4px',
                borderTop: i === 0 ? 'none' : '0.5px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                transition: 'background 0.18s ease',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.022)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 13,
                  fontWeight: 600,
                  color: ae.textMute,
                  letterSpacing: '0.02em',
                  textAlign: 'center',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: isChecked
                    ? `linear-gradient(180deg, rgba(${GREEN.glow}, 0.9), rgba(${GREEN.glow}, 0.65))`
                    : 'rgba(255,255,255,0.015)',
                  border: isChecked
                    ? `1px solid rgba(${GREEN.glow}, 0.9)`
                    : '1px solid rgba(255,255,255,0.18)',
                  boxShadow: isChecked ? `0 0 14px rgba(${GREEN.glow}, 0.4)` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background .25s ease, border-color .25s ease, box-shadow .25s ease',
                }}
              >
                {isChecked ? (
                  <span style={{ display: 'inline-flex' }}>
                    <Icon name="check" size={14} color="#0c130c" strokeWidth={2.8} />
                  </span>
                ) : null}
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: ae.fontDisplay,
                      fontSize: 18,
                      fontWeight: 600,
                      color: isChecked ? ae.textMute : ae.text,
                      letterSpacing: '-0.01em',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      transition: 'color .25s ease',
                    }}
                  >
                    {it.label}
                  </span>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.04)',
                      border: '0.5px solid rgba(255,255,255,0.10)',
                      fontFamily: ae.fontMono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: ae.textMute,
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.time}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 7,
                    fontFamily: ae.fontBody,
                    fontSize: 14,
                    color: ae.textMute,
                    lineHeight: 1.45,
                    opacity: isChecked ? 0.6 : 1,
                    transition: 'opacity .25s ease',
                  }}
                >
                  {it.desc}
                </div>
              </div>

              <span style={{ display: 'inline-flex', justifySelf: 'end' }}>
                <Icon name="chevron" size={17} color={ae.textMute} strokeWidth={1.6} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

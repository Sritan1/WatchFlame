'use client';

// Left navigation rail — 240px fixed. Brand mark, Watching selector,
// Operations + Planning groups, Feeds Live status, Settings.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { LocationsModal } from '@/components/location/LocationsModal';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, hexToRgb, RISK_LEVELS } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  shortcut?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Mirrors the mobile app's 4 tabs (Status / Map / Safety / Risk).
// Grouped Operations vs Planning to match the reference's visual rhythm,
// even though it's 2+2 instead of 3+3.
const GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/',    icon: 'grid', label: 'Command Center', shortcut: 'S' },
      { href: '/map', icon: 'map',  label: 'Live Map',       shortcut: 'M' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { href: '/risk',   icon: 'flame',  label: 'Risk Forecast', shortcut: 'R' },
      { href: '/safety', icon: 'shield', label: 'Safety Plan',   shortcut: 'P' },
    ],
  },
];

export function Sidebar({ riskColor }: { riskColor?: string }) {
  const { ae, accent } = useAesthetic();
  const pathname = usePathname();
  const loc = useUserLocation();
  const [locationsOpen, setLocationsOpen] = useState(false);
  const r = getRisk('extreme', accent);
  const accentColor = riskColor ?? ae.text;
  const accentRgb = riskColor ? hexToRgb(riskColor) : '255, 255, 255';

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 240,
        zIndex: 30,
        background: `linear-gradient(180deg, ${ae.surface}, ${ae.bg})`,
        borderRight: `0.5px solid ${ae.line}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Brand */}
      <div
        style={{
          height: 64,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `0.5px solid ${ae.line}`,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `radial-gradient(circle at 30% 30%, ${r.color}, rgba(${r.glow}, 0.55) 70%)`,
            border: `0.5px solid rgba(${r.glow}, 0.5)`,
            boxShadow: `0 0 18px rgba(${r.glow}, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="flame" size={15} color="#fff" strokeWidth={2} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: ae.text,
            }}
          >
            EMBER
          </span>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.22em',
              color: ae.textMute,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Watch · v3
          </span>
        </div>
      </div>

      {/* Watching — opens LocationsModal */}
      <button
        type="button"
        onClick={() => setLocationsOpen(true)}
        className="web-cmdk"
        style={{
          margin: '14px 14px 0',
          padding: '10px 12px',
          background: ae.surface2,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          color: ae.text,
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: `rgba(${r.glow}, 0.12)`,
            border: `0.5px solid rgba(${r.glow}, 0.30)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="pin" size={11} color={r.color} strokeWidth={1.6} />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9,
              color: ae.textMute,
              letterSpacing: '0.14em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
              fontWeight: 600,
            }}
          >
            Watching
          </div>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 13,
              fontWeight: 600,
              color: ae.text,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: ae.titleTracking,
            }}
          >
            {loc.label}
          </div>
        </div>
        <Icon name="caret" size={14} color={ae.textMute} strokeWidth={1.6} />
      </button>

      <LocationsModal open={locationsOpen} onClose={() => setLocationsOpen(false)} />

      {/* Nav groups */}
      <nav style={{ marginTop: 18, padding: '0 10px', flex: 1, overflowY: 'auto' }} className="ember-scroll">
        {GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 18 }}>
            <div
              style={{
                padding: '6px 14px',
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.16em',
                color: ae.textMute,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {g.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="web-nav-item"
                    data-active={isActive}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '9px 14px',
                      background: isActive
                        ? `linear-gradient(90deg, rgba(${accentRgb}, 0.13), rgba(${accentRgb}, 0.04))`
                        : 'transparent',
                      border: 'none',
                      borderRadius: 10,
                      textDecoration: 'none',
                      color: isActive ? ae.text : ae.textDim,
                      transition: 'background .18s ease, color .18s ease',
                    }}
                  >
                    {isActive && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 4,
                          top: '50%',
                          width: 3,
                          height: 18,
                          borderRadius: 2,
                          transform: 'translateY(-50%)',
                          background: accentColor,
                          boxShadow: `0 0 8px ${accentColor}`,
                        }}
                      />
                    )}
                    <Icon
                      name={item.icon}
                      size={16}
                      color={isActive ? accentColor : ae.textDim}
                      strokeWidth={isActive ? 1.8 : 1.5}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontFamily: ae.fontBody,
                        fontSize: 13.5,
                        fontWeight: isActive ? 600 : 500,
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {item.label}
                    </span>
                    {item.shortcut ? (
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.04)',
                          border: `0.5px solid ${ae.line}`,
                          color: ae.textMute,
                          fontFamily: ae.fontMono,
                          fontSize: 9.5,
                          fontWeight: 500,
                          letterSpacing: '0.06em',
                        }}
                      >
                        ⌘{item.shortcut}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Feeds Live status */}
      <div
        style={{
          margin: 12,
          padding: 12,
          borderRadius: 10,
          background: ae.surface2,
          border: ae.cardBorder,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: RISK_LEVELS.low.color,
                boxShadow: `0 0 8px ${RISK_LEVELS.low.color}`,
                animation: 'ember-flicker 2.4s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.14em',
                color: ae.textDim,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Feeds Live
            </span>
          </div>
          <span style={{ fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute }}>2s</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {['CAL FIRE', 'NWS', 'NIFC'].map((s) => (
            <div
              key={s}
              style={{
                padding: '5px 0',
                textAlign: 'center',
                borderRadius: 5,
                background: 'rgba(255,255,255,0.03)',
                fontFamily: ae.fontMono,
                fontSize: 9,
                fontWeight: 600,
                color: ae.textDim,
                letterSpacing: '0.06em',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Settings — mirrors the cog on mobile's StatusHeader.
         Standalone since we don't have auth/accounts yet. */}
      <Link
        href="/settings"
        style={{
          padding: '12px 16px',
          borderTop: `0.5px solid ${ae.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: ae.textDim,
        }}
        className="web-nav-item"
        aria-label="Open settings"
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${ae.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="settings" size={13} color={ae.textDim} strokeWidth={1.5} />
        </div>
        <span
          style={{
            fontFamily: ae.fontBody,
            fontSize: 13,
            fontWeight: 500,
            color: ae.textDim,
            letterSpacing: '-0.005em',
          }}
        >
          Settings
        </span>
      </Link>
    </aside>
  );
}

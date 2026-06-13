'use client';

// Floating glass rail — detached 220px sidebar with magnetic active-pill,
// hover ghost, and ambient glow. Matches the reference's premium aesthetic.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { LocationsModal } from '@/components/location/LocationsModal';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  group?: string;
}

// Mirrors the mobile app's 4 tabs (Status / Map / Risk / Safety).
// Group label attaches to the FIRST item in each group, drawn as a header
// row above the button with a hairline gradient to its right.
const NAV_ITEMS: NavItem[] = [
  { href: '/',       icon: 'grid',   label: 'Command Center', group: 'Operations' },
  { href: '/map',    icon: 'map',    label: 'Live Map' },
  { href: '/risk',   icon: 'flame',  label: 'Fire-Weather What-If',  group: 'Planning' },
  { href: '/safety', icon: 'shield', label: 'Safety Plan' },
];

// Chrome accent — peach-orange that reads as the brand's signature warmth.
// `riskColor` prop overrides this so pages can re-tint the rail with their
// own current risk level if desired.
const DEFAULT_ACCENT = '#FFA76A';

export function Sidebar({ riskColor }: { riskColor?: string }) {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  const loc = useUserLocation();
  const [locationsOpen, setLocationsOpen] = useState(false);

  const accent = riskColor ?? DEFAULT_ACCENT;
  const accentRgb = hexToRgb(accent);
  const bgRgb = hexToRgb(ae.bg);

  // Magnetic active pill + hover ghost
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState({ top: 0, h: 36, ready: false });
  const [hover, setHover] = useState({ top: 0, h: 36, opacity: 0 });

  const measure = useCallback((href: string) => {
    const node = itemRefs.current[href];
    const wrap = navRef.current;
    if (!node || !wrap) return null;
    return { top: node.offsetTop, h: node.offsetHeight };
  }, []);

  const activeHref = NAV_ITEMS.reduce<string | null>((best, item) => {
    if (item.href === '/') return pathname === '/' ? '/' : best;
    if (pathname.startsWith(item.href)) return item.href;
    return best;
  }, null);

  useLayoutEffect(() => {
    if (!activeHref) {
      setPill((s) => ({ ...s, ready: false }));
      return;
    }
    const m = measure(activeHref);
    if (m) setPill({ top: m.top, h: m.h, ready: true });
  }, [activeHref, measure]);

  useEffect(() => {
    const onResize = () => {
      if (!activeHref) return;
      const m = measure(activeHref);
      if (m) setPill({ top: m.top, h: m.h, ready: true });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeHref, measure]);

  return (
    <aside
      style={{
        position: 'fixed',
        top: 14,
        left: 14,
        bottom: 14,
        width: 220,
        zIndex: 30,
        borderRadius: 26,
        overflow: 'hidden',
        background: `
          radial-gradient(120% 50% at 50% -10%, rgba(${accentRgb}, 0.14), transparent 65%),
          radial-gradient(80% 40% at 110% 100%, rgba(${accentRgb}, 0.06), transparent 60%),
          linear-gradient(180deg, rgba(${bgRgb}, 0.82), rgba(${bgRgb}, 0.66))
        `,
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.10)',
        boxShadow: `
          0 30px 80px rgba(0,0,0,0.55),
          0 8px 30px rgba(0,0,0,0.35),
          inset 0 1px 0 rgba(255,255,255,0.10),
          inset 0 -1px 0 rgba(0,0,0,0.30)
        `,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Aurora veil — subtle sheen along the inside edge */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%),
            linear-gradient(0deg,   rgba(255,255,255,0.02), transparent 25%)
          `,
          borderRadius: 'inherit',
        }}
      />

      {/* Brand — ember stone + EMBER / Watch · v3 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '18px 18px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 32,
            height: 32,
            borderRadius: 10,
            background: `
              radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), transparent 60%),
              radial-gradient(circle at 60% 60%, ${accent}, rgba(${accentRgb}, 0.6) 70%)
            `,
            border: `0.5px solid rgba(${accentRgb}, 0.55)`,
            boxShadow: `
              0 0 22px rgba(${accentRgb}, 0.55),
              0 6px 18px rgba(${accentRgb}, 0.35),
              inset 0 1px 0 rgba(255,255,255,0.35),
              inset 0 -1px 2px rgba(0,0,0,0.30)
            `,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="flame" size={16} color="#fff" strokeWidth={2} />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 4,
              left: 6,
              width: 6,
              height: 4,
              borderRadius: 99,
              background: 'rgba(255,255,255,0.7)',
              filter: 'blur(1.5px)',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.20em',
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
              letterSpacing: '0.24em',
              color: ae.textMute,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Watch · v4
          </span>
        </div>
      </div>

      {/* Watching — opens LocationsModal */}
      <button
        type="button"
        onClick={() => setLocationsOpen(true)}
        className="web-region"
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '0 14px 6px',
          padding: '9px 12px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          color: ae.text,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: `linear-gradient(135deg, rgba(${accentRgb}, 0.30), rgba(${accentRgb}, 0.10))`,
            border: `0.5px solid rgba(${accentRgb}, 0.35)`,
            boxShadow: `0 2px 8px rgba(${accentRgb}, 0.25), inset 0 1px 0 rgba(255,255,255,0.18)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'ember-pin-pulse 2.6s ease-in-out infinite',
            ['--pin-glow' as string]: accentRgb,
          }}
        >
          <Icon name="pin" size={11} color={accent} strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9,
              color: ae.textMute,
              letterSpacing: '0.16em',
              fontWeight: 600,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Watching
          </div>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 12.5,
              fontWeight: 600,
              color: ae.text,
              marginTop: 1,
              letterSpacing: ae.titleTracking,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {loc.label}
          </div>
        </div>
        <Icon name="caret" size={13} color={ae.textMute} strokeWidth={1.6} />
      </button>

      <LocationsModal open={locationsOpen} onClose={() => setLocationsOpen(false)} />

      {/* Nav — relative-positioned host for the magnetic pill + hover ghost */}
      <nav
        ref={navRef}
        className="ember-scroll"
        onMouseLeave={() => setHover((h) => ({ ...h, opacity: 0 }))}
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          padding: '12px 10px 6px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Hover ghost — soft underlay that follows mouse over items */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: hover.top,
            height: hover.h,
            opacity: hover.opacity,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.045)',
            border: '0.5px solid rgba(255,255,255,0.05)',
            transition:
              'top .26s cubic-bezier(0.34, 1.2, 0.4, 1), height .26s cubic-bezier(0.34, 1.2, 0.4, 1), opacity .18s ease',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Magnetic active pill */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: pill.top,
            height: pill.h,
            opacity: pill.ready ? 1 : 0,
            borderRadius: 14,
            background: `linear-gradient(180deg, rgba(${accentRgb}, 0.18), rgba(${accentRgb}, 0.04))`,
            border: `0.5px solid rgba(${accentRgb}, 0.38)`,
            boxShadow: `
              0 6px 22px rgba(${accentRgb}, 0.22),
              0 2px 8px rgba(${accentRgb}, 0.18),
              inset 0 1px 0 rgba(255,255,255,0.10),
              inset 0 0 0 0.5px rgba(255,255,255,0.04)
            `,
            transition:
              'top .55s cubic-bezier(0.34, 1.45, 0.34, 1), height .55s cubic-bezier(0.34, 1.45, 0.34, 1), opacity .18s ease',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {/* Edge accent line */}
          <span
            style={{
              position: 'absolute',
              left: -1,
              top: 8,
              bottom: 8,
              width: 2,
              borderRadius: 2,
              background: `linear-gradient(180deg, transparent, ${accent}, transparent)`,
              boxShadow: `0 0 10px ${accent}, 0 0 4px ${accent}`,
            }}
          />
        </div>

        {/* Ambient glow tracking the active item */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: -60,
            right: -60,
            top: pill.top - 60,
            height: pill.h + 120,
            opacity: pill.ready ? 0.7 : 0,
            background: `radial-gradient(50% 60% at 50% 50%, rgba(${accentRgb}, 0.22), transparent 70%)`,
            filter: 'blur(14px)',
            pointerEvents: 'none',
            zIndex: -1,
            transition: 'top .55s cubic-bezier(0.34, 1.45, 0.34, 1), opacity .18s ease',
          }}
        />

        {NAV_ITEMS.map((item, i) => {
          const isActive = activeHref === item.href;
          return (
            <div key={item.href}>
              {item.group && (
                <div
                  style={{
                    marginTop: i === 0 ? 0 : 14,
                    padding: '4px 14px 8px',
                    fontFamily: ae.fontMono,
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.22em',
                    color: ae.textMute,
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{item.group}</span>
                  <span
                    style={{
                      flex: 1,
                      height: 1,
                      opacity: 0.6,
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.10), transparent)',
                    }}
                  />
                </div>
              )}
              <Link
                ref={(el) => {
                  itemRefs.current[item.href] = el;
                }}
                href={item.href}
                className="web-nav-item"
                data-active={isActive}
                onMouseEnter={() => {
                  const m = measure(item.href);
                  if (m) setHover({ top: m.top, h: m.h, opacity: isActive ? 0 : 1 });
                }}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  height: 38,
                  padding: '0 10px 0 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: isActive ? ae.text : ae.textDim,
                }}
              >
                <div
                  className="web-nav-stone"
                  style={{
                    position: 'relative',
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: isActive
                      ? `linear-gradient(135deg, rgba(${accentRgb}, 0.38), rgba(${accentRgb}, 0.10))`
                      : 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))',
                    border: `0.5px solid ${
                      isActive ? `rgba(${accentRgb}, 0.50)` : 'rgba(255,255,255,0.07)'
                    }`,
                    boxShadow: isActive
                      ? `0 4px 14px rgba(${accentRgb}, 0.35),
                         inset 0 1px 0 rgba(255,255,255,0.20),
                         inset 0 -1px 1px rgba(0,0,0,0.25)`
                      : `inset 0 1px 0 rgba(255,255,255,0.06),
                         inset 0 -1px 1px rgba(0,0,0,0.15)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition:
                      'transform .25s cubic-bezier(0.34,1.45,0.34,1), background .25s ease, box-shadow .25s ease, border-color .25s ease',
                  }}
                >
                  <Icon
                    name={item.icon}
                    size={13.5}
                    color={isActive ? '#fff' : ae.textDim}
                    strokeWidth={isActive ? 2 : 1.6}
                  />
                  {isActive && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: 5,
                        width: 5,
                        height: 3,
                        borderRadius: 99,
                        background: 'rgba(255,255,255,0.5)',
                        filter: 'blur(1px)',
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: ae.fontBody,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '-0.005em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'color .2s ease',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Feeds Live — translucent capsule */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '8px 12px 8px',
          padding: 11,
          borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
          border: '0.5px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: RISK_LEVELS.low.color,
                  boxShadow: `0 0 8px ${RISK_LEVELS.low.color}, 0 0 2px ${RISK_LEVELS.low.color}`,
                  animation: 'ember-flicker 2.4s ease-in-out infinite',
                }}
              />
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: 99,
                  border: `1px solid ${RISK_LEVELS.low.color}`,
                  opacity: 0.5,
                  animation: 'web-ping 2.4s ease-out infinite',
                }}
              />
            </span>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.16em',
                color: ae.textDim,
                textTransform: 'uppercase',
              }}
            >
              Feeds Live
            </span>
          </div>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              color: ae.textMute,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            2s
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {['FIRMS', 'NIFC', 'CAL FIRE'].map((s) => (
            <div
              key={s}
              style={{
                padding: '5px 0',
                textAlign: 'center',
                borderRadius: 6,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
                border: '0.5px solid rgba(255,255,255,0.05)',
                fontFamily: ae.fontMono,
                fontSize: 8.5,
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

      {/* Settings — single chip (no profile since we don't have auth) */}
      <Link
        href="/settings"
        data-active={pathname === '/settings'}
        className="web-region"
        aria-label="Open settings"
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '0 12px 12px',
          padding: '8px 10px',
          borderRadius: 14,
          cursor: 'pointer',
          background:
            pathname === '/settings'
              ? `linear-gradient(180deg, rgba(${accentRgb}, 0.14), rgba(${accentRgb}, 0.03))`
              : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
          border:
            pathname === '/settings'
              ? `0.5px solid rgba(${accentRgb}, 0.38)`
              : '0.5px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow:
            pathname === '/settings'
              ? `0 6px 22px rgba(${accentRgb}, 0.22), inset 0 1px 0 rgba(255,255,255,0.08)`
              : 'inset 0 1px 0 rgba(255,255,255,0.06)',
          textDecoration: 'none',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            flexShrink: 0,
            background:
              pathname === '/settings'
                ? `linear-gradient(135deg, rgba(${accentRgb}, 0.38), rgba(${accentRgb}, 0.10))`
                : 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))',
            border: `0.5px solid ${
              pathname === '/settings' ? `rgba(${accentRgb}, 0.50)` : 'rgba(255,255,255,0.07)'
            }`,
            boxShadow:
              pathname === '/settings'
                ? `0 4px 14px rgba(${accentRgb}, 0.35), inset 0 1px 0 rgba(255,255,255,0.20)`
                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name="settings"
            size={13}
            color={pathname === '/settings' ? '#fff' : ae.textDim}
            strokeWidth={pathname === '/settings' ? 2 : 1.6}
          />
        </div>
        <span
          style={{
            flex: 1,
            fontFamily: ae.fontBody,
            fontSize: 13,
            fontWeight: pathname === '/settings' ? 600 : 500,
            color: pathname === '/settings' ? ae.text : ae.textDim,
            letterSpacing: '-0.005em',
          }}
        >
          Settings
        </span>
      </Link>
    </aside>
  );
}

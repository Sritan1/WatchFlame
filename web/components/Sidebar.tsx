'use client';

// Floating glass rail — detached 220px sidebar with magnetic active-pill,
// hover ghost, and ambient glow. Matches the reference's premium aesthetic.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { BrandMark } from '@/components/BrandMark';
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
  { href: '/',       icon: 'grid',   label: 'Status', group: 'Operations' },
  { href: '/map',    icon: 'map',    label: 'Live Map' },
  { href: '/risk',   icon: 'flame',  label: 'Fire-Weather What-If',  group: 'Planning' },
  { href: '/safety', icon: 'shield', label: 'Safety' },
];

// Chrome accent — peach-orange that reads as the brand's signature warmth.
const DEFAULT_ACCENT = '#FFA76A';

// ─── Data Feeds widget ──────────────────────────────────────────────────────
// The capsule shows the three most fundamental data sources for the CURRENT
// screen and, on click, opens a popover listing EVERY source that powers that
// screen (provenance, not live health — the down-state shows contextually on
// each screen instead). `chip` is the short label in the 3-up grid; `name` +
// `desc` fill the popover rows.
type Feed = { chip: string; name: string; desc: string };
const FEEDS: Record<string, Feed> = {
  firms:     { chip: 'FIRMS',    name: 'NASA FIRMS',    desc: 'Satellite fire detections' },
  nifc:      { chip: 'NIFC',     name: 'NIFC',          desc: 'Interagency incident data' },
  calfire:   { chip: 'CAL FIRE', name: 'Cal Fire',      desc: 'California incidents' },
  owm:       { chip: 'OWM',      name: 'OpenWeather',   desc: 'Current conditions' },
  openmeteo: { chip: 'O-METEO',  name: 'Open-Meteo',    desc: 'Drought and forecast' },
  cdse:      { chip: 'CDSE',     name: 'Copernicus',    desc: 'Sentinel-2 vegetation' },
  census:    { chip: 'CENSUS',   name: 'US Census',     desc: 'County and state lookup' },
  nlcd:      { chip: 'NLCD',     name: 'NLCD',          desc: 'Land cover' },
  fema:      { chip: 'FEMA',     name: 'FEMA',          desc: 'Disaster declarations' },
  femanss:   { chip: 'FEMA NSS', name: 'FEMA NSS',      desc: 'Open shelters' },
  osm:       { chip: 'OSM',      name: 'OpenStreetMap', desc: 'Open map data' },
  nces:      { chip: 'NCES',     name: 'NCES',          desc: 'Public schools' },
  maptiler:  { chip: 'MAPTILER', name: 'MapTiler',      desc: 'Base map tiles' },
  fpafod:    { chip: 'FPA-FOD',  name: 'FPA-FOD',       desc: 'Historical fire calibration' },
};

const ALL_FEEDS = [
  'firms', 'nifc', 'calfire', 'owm', 'openmeteo', 'cdse', 'census', 'nlcd',
  'fema', 'femanss', 'osm', 'nces', 'maptiler', 'fpafod',
];

// Per-screen roster, ordered so the FIRST THREE are the chip's labels and the
// full list fills the popover. Settings + any unmapped route → the full roster.
const SCREEN_FEEDS: Record<string, string[]> = {
  '/':            ['firms', 'nifc', 'owm', 'calfire', 'openmeteo', 'cdse', 'nlcd', 'census'],
  '/map':         ['firms', 'nifc', 'calfire', 'maptiler', 'osm'],
  '/risk':        ['owm', 'cdse', 'openmeteo', 'census', 'fpafod'],
  '/safety':      ['fema', 'calfire', 'nces', 'nifc', 'firms', 'femanss', 'osm', 'owm', 'openmeteo', 'cdse', 'census'],
  '/fire-detail': ['firms', 'nifc', 'calfire', 'owm', 'maptiler', 'osm'],
};
function feedsForRoute(pathname: string): string[] {
  return SCREEN_FEEDS[pathname] ?? ALL_FEEDS;
}

// ─── FeedsPopover — anchored glass popover listing all of a screen's sources ──
// Portaled to <body> so it floats free of the rail's backdrop-filter + overflow
// clip. Positioned to the right of the card (flips above on a narrow viewport),
// with a speech-bubble arrow tying it back. Adapted from web-shell.jsx (the
// per-source latency + the "N live" count are intentionally dropped).
function FeedsPopover({
  feeds,
  anchorRef,
  popRef,
  closing,
  onRequestClose,
}: {
  feeds: string[];
  anchorRef: RefObject<HTMLDivElement | null>;
  popRef: RefObject<HTMLDivElement | null>;
  closing: boolean;
  onRequestClose: () => void;
}) {
  const { ae } = useAesthetic();
  const [pos, setPos] = useState<{ left: number; bottom: number; flip: boolean } | null>(null);
  const [animIn, setAnimIn] = useState(true);
  const green = RISK_LEVELS.low.color;

  useEffect(() => {
    const id = window.setTimeout(() => setAnimIn(false), 240);
    return () => window.clearTimeout(id);
  }, []);

  const place = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const W = 272;
    const left = r.right + 12;
    const flip = left + W > window.innerWidth - 8;
    const next = flip
      ? { left: r.left, bottom: Math.round(window.innerHeight - r.top + 12), flip: true }
      : { left, bottom: Math.round(window.innerHeight - (r.top + r.height)) - 2, flip: false };
    // Bail out when the anchor hasn't actually moved (it is fixed to the
    // sidebar, so scrolling the page recomputes the same values) — this avoids
    // a re-render on every scroll event.
    setPos((prev) =>
      prev && prev.left === next.left && prev.bottom === next.bottom && prev.flip === next.flip
        ? prev
        : next,
    );
  }, [anchorRef]);

  useLayoutEffect(() => place(), [place]);
  useEffect(() => {
    // Coalesce resize/scroll bursts to at most one layout read per frame
    // instead of a getBoundingClientRect + setState on every event.
    let raf = 0;
    const fn = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        place();
      });
    };
    window.addEventListener('resize', fn);
    window.addEventListener('scroll', fn, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', fn);
      window.removeEventListener('scroll', fn, true);
    };
  }, [place]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  if (!pos) return null;

  const bgRgb = hexToRgb(ae.bg);
  const glass = {
    background: `linear-gradient(180deg, rgba(${bgRgb}, 0.92), rgba(${bgRgb}, 0.82))`,
    backdropFilter: 'blur(26px) saturate(180%)',
    WebkitBackdropFilter: 'blur(26px) saturate(180%)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    boxShadow:
      '0 24px 60px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
  } as const;

  return (
    <div
      ref={popRef}
      className={`feeds-pop${closing ? ' anim-out' : animIn ? ' anim-in' : ''}`}
      role="dialog"
      aria-label="All data feeds"
      style={{
        position: 'fixed',
        zIndex: 60,
        left: pos.left,
        bottom: pos.bottom,
        width: 272,
        transformOrigin: pos.flip ? 'bottom left' : 'left bottom',
      }}
    >
      {/* Speech-bubble arrow */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          ...(pos.flip ? { bottom: -6, left: 26 } : { left: -6, bottom: 24 }),
          width: 12,
          height: 12,
          borderRadius: 2,
          background: `rgba(${bgRgb}, 0.92)`,
          backdropFilter: 'blur(26px) saturate(180%)',
          WebkitBackdropFilter: 'blur(26px) saturate(180%)',
          borderLeft: pos.flip ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
          borderBottom: '0.5px solid rgba(255,255,255,0.12)',
          borderRight: pos.flip ? '0.5px solid rgba(255,255,255,0.12)' : 'none',
          borderTop: pos.flip ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
          transform: 'rotate(45deg)',
        }}
      />

      <div style={{ ...glass, borderRadius: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px 10px',
            borderBottom: '0.5px solid rgba(255,255,255,0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: green,
                  boxShadow: `0 0 8px ${green}, 0 0 2px ${green}`,
                  animation: 'ember-flicker 2.4s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: 99,
                  border: `1px solid ${green}`,
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
              Data Feeds
            </span>
          </div>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9,
              color: ae.textMute,
              letterSpacing: '0.04em',
            }}
          >
            {feeds.length} sources
          </span>
        </div>

        {/* Source rows */}
        <div
          style={{
            maxHeight: 'min(72vh, 480px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '5px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {feeds.map((key) => {
            const f = FEEDS[key];
            if (!f) return null;
            return (
              <div
                key={key}
                className="feeds-pop-row"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', borderRadius: 9 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    flexShrink: 0,
                    background: green,
                    boxShadow: `0 0 7px ${green}, 0 0 2px ${green}`,
                    animation: 'ember-flicker 2.4s ease-in-out infinite',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: ae.text,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {f.name}
                  </div>
                  <div
                    style={{
                      fontFamily: ae.fontBody,
                      fontSize: 10.5,
                      color: ae.textMute,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {f.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  const loc = useUserLocation();
  const [locationsOpen, setLocationsOpen] = useState(false);

  // Sources for this screen: the first three are the chip labels, the full
  // list fills the popover.
  const screenFeeds = feedsForRoute(pathname);
  const topThree = screenFeeds.slice(0, 3);

  // Data-feeds popover (click the card → list all of this screen's sources).
  const feedsCardRef = useRef<HTMLDivElement | null>(null);
  const feedsPopRef = useRef<HTMLDivElement | null>(null);
  const feedsOpenRef = useRef(false);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const [feedsClosing, setFeedsClosing] = useState(false);
  useEffect(() => {
    feedsOpenRef.current = feedsOpen && !feedsClosing;
  }, [feedsOpen, feedsClosing]);
  const closeFeeds = useCallback(() => {
    feedsOpenRef.current = false;
    setFeedsClosing(true);
    window.setTimeout(() => {
      setFeedsOpen(false);
      setFeedsClosing(false);
    }, 150);
  }, []);
  const toggleFeeds = useCallback(() => {
    if (feedsOpenRef.current) {
      closeFeeds();
    } else {
      feedsOpenRef.current = true;
      setFeedsClosing(false);
      setFeedsOpen(true);
    }
  }, [closeFeeds]);
  // Dismiss on a click outside the card + popover (a click on the card itself
  // is handled by toggleFeeds, so it's excluded here).
  useEffect(() => {
    if (!feedsOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (feedsCardRef.current?.contains(t)) return;
      if (feedsPopRef.current?.contains(t)) return;
      closeFeeds();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [feedsOpen, closeFeeds]);
  // Close when the route changes.
  useEffect(() => {
    feedsOpenRef.current = false;
    setFeedsOpen(false);
    setFeedsClosing(false);
  }, [pathname]);

  const accent = DEFAULT_ACCENT;
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
      className="app-sidebar"
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

      {/* Brand — flame stone + WatchFlame wordmark ("flame" in the accent). */}
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
        <BrandMark size={32} />
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.01em',
            lineHeight: 1.05,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: ae.text }}>Watch</span>
          <span style={{ color: accent }}>Flame</span>
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

      {/* Data feeds — click to open the full source list popover */}
      <div
        ref={feedsCardRef}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={feedsOpen && !feedsClosing}
        onClick={toggleFeeds}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFeeds();
          }
        }}
        style={{
          position: 'relative',
          zIndex: 1,
          cursor: 'pointer',
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {topThree.map((key) => (
            <div
              key={key}
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
              {FEEDS[key].chip}
            </div>
          ))}
        </div>
      </div>

      {feedsOpen && typeof document !== 'undefined'
        ? createPortal(
            <FeedsPopover
              feeds={screenFeeds}
              anchorRef={feedsCardRef}
              popRef={feedsPopRef}
              closing={feedsClosing}
              onRequestClose={closeFeeds}
            />,
            document.body,
          )
        : null}

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

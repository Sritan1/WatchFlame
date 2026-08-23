'use client';

// The bottom tab bar, which stands in for the sidebar on a phone. It renders
// either way and CSS decides which of the two is visible, so desktop is
// untouched.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb } from '@/lib/theme';

const ITEMS: { href: string; icon: IconName; label: string }[] = [
  { href: '/', icon: 'grid', label: 'Status' },
  { href: '/map', icon: 'map', label: 'Map' },
  { href: '/risk', icon: 'flame', label: 'What-If' },
  { href: '/safety', icon: 'shield', label: 'Safety' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
];

const ACCENT = '#FFA76A';

export function MobileNav() {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  const accentRgb = hexToRgb(ACCENT);
  const bgRgb = hexToRgb(ae.bg);
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav
      className="app-bottomnav"
      aria-label="Primary"
      style={{
        display: 'none', // hidden on desktop, flipped to flex by the mobile media query
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: `linear-gradient(180deg, rgba(${bgRgb}, 0.86), rgba(${bgRgb}, 0.97))`,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '0.5px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.45)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {ITEMS.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-label={it.label}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '9px 0 7px',
              textDecoration: 'none',
              color: active ? ae.text : ae.textMute,
              minHeight: 52, // comfortable touch target
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 26,
                borderRadius: 9,
                background: active
                  ? `linear-gradient(135deg, rgba(${accentRgb}, 0.32), rgba(${accentRgb}, 0.10))`
                  : 'transparent',
                border: active
                  ? `0.5px solid rgba(${accentRgb}, 0.42)`
                  : '0.5px solid transparent',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
            >
              <Icon
                name={it.icon}
                size={17}
                color={active ? ACCENT : ae.textMute}
                strokeWidth={active ? 2 : 1.7}
              />
            </span>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 8.5,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {it.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

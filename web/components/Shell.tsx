'use client';

// Top-level layout: floating 220px glass sidebar (14px inset on all sides) +
// sticky floating 56px topbar dock + content slot. Pages render INTO this
// shell — they don't repeat sidebar/topbar. Content offset = 14 (gutter) +
// 220 (sidebar) + 14 (gap) = 248px from the viewport's left edge.

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { useAesthetic } from '@/lib/aesthetic';

export function Shell({ children }: { children: ReactNode }) {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  return (
    <div style={{ background: ae.bg, color: ae.text, minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: 248 }}>
        <Topbar />
        {/* `key={pathname}` re-mounts the main on route change, replaying the
         *  ember-route-fade animation so each page entrance gets a 220ms
         *  fade+lift instead of a snap. */}
        <main
          key={pathname}
          className="ember-route-fade"
          style={{ background: ae.bg, minHeight: 'calc(100vh - 80px)' }}
        >
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}

function Footer() {
  const { ae } = useAesthetic();
  return (
    <footer
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        borderTop: `0.5px solid ${ae.line}`,
        background: ae.bg,
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.16em',
        color: ae.textMute,
        textTransform: 'uppercase',
      }}
    >
      <span>Ember Watch · v3.0 · Built 2026</span>
      <span>FIRMS · NIFC · Cal Fire · Open-Meteo · OWM · FEMA · OSM · NCES</span>
    </footer>
  );
}

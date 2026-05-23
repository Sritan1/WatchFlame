'use client';

// Top-level layout: fixed 240px sidebar + sticky 64px topbar + content slot.
// Pages render INTO this shell — they don't repeat sidebar/topbar.

import type { ReactNode } from 'react';

import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { useAesthetic } from '@/lib/aesthetic';

export function Shell({ children }: { children: ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <div style={{ background: ae.bg, color: ae.text, minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: 240 }}>
        <Topbar />
        <main style={{ background: ae.bg, minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

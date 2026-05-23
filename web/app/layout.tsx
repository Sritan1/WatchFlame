import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';

import { AestheticProvider } from '@/lib/aesthetic';
import { QueryProvider } from '@/lib/query-provider';
import { SavedLocationsProvider } from '@/lib/use-saved-locations';
import { UnitsProvider } from '@/lib/use-units';

import './globals.css';

const interBody = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const interDisplay = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ember Watch — Wildfire Intelligence',
  description: 'Real-time wildfire risk monitoring, evacuation planning, and federal advisory tracking.',
};

export const viewport: Viewport = {
  themeColor: '#0B0E12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interBody.variable} ${interDisplay.variable} ${mono.variable}`}
    >
      <body>
        <QueryProvider>
          <AestheticProvider>
            <UnitsProvider>
              <SavedLocationsProvider>{children}</SavedLocationsProvider>
            </UnitsProvider>
          </AestheticProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

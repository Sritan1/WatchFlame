import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { AestheticProvider } from '@/lib/aesthetic';
import { QueryProvider } from '@/lib/query-provider';
import { SavedLocationsProvider } from '@/lib/use-saved-locations';
import { UnitsProvider } from '@/lib/use-units';

import './globals.css';

// Geist (Vercel's typeface) handles both body and display — single-family
// approach reads cleaner than Inter+Inter Tight + JetBrains Mono. The 300
// weight enables a light-caption / heavy-data contrast pattern.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
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
      className={`${geistSans.variable} ${geistMono.variable}`}
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

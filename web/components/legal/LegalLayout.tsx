import Link from 'next/link';
import type { ReactNode } from 'react';

import { Shell } from '@/components/Shell';
import { PageSection } from '@/components/ui/PageSection';

/** Shared layout for the Terms / Privacy / Accessibility documents: the normal
 *  app Shell (nav stays reachable) + a readable prose column. Content is plain
 *  semantic markup (h2/p/ul) styled by `.legal-prose` in globals.css — which
 *  keeps it screen-reader-friendly. */
export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <Shell>
      <PageSection top={28} bottom={56}>
        <article className="legal-prose">
          <h1>{title}</h1>
          <p className="legal-meta">Last updated {lastUpdated}</p>
          {children}
          <p style={{ marginTop: 36 }}>
            <Link href="/">← Back to Ember Watch</Link>
          </p>
        </article>
      </PageSection>
    </Shell>
  );
}

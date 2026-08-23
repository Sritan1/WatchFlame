import Link from 'next/link';
import type { ReactNode } from 'react';

import { Shell } from '@/components/Shell';
import { PageSection } from '@/components/ui/PageSection';

/** Shared layout for the legal documents, the normal Shell so nav stays reachable,
 *  plus a prose column. The content is plain semantic markup styled by .legal-prose,
 *  which keeps it readable to a screen reader. */
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
            <Link href="/">← Back to WatchFlame</Link>
          </p>
        </article>
      </PageSection>
    </Shell>
  );
}

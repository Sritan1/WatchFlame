'use client';

// The TanStack Query provider. It gets its own file because the root layout is a
// Server Component and this has to run on the client.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  // State keeps one client for the session. A new one each render would re-fire
  // every query.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // No refetch on focus. Most of this data only moves upstream every 15
            // minutes anyway.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

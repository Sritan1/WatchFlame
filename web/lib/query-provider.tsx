'use client';

// TanStack Query client provider. Lives in its own file because the root
// layout is a Server Component and useState/QueryClient are client-only.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures a single QueryClient per browser session — recreating it
  // on every render would re-fire every query.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Match mobile defaults: data is fresh for 1 min, no refetch on
            // window focus (annoying in this app — most data has its own
            // upstream cadence of 15+ min).
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

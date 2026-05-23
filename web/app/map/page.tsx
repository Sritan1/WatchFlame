// Live Map route. MapScreen owns the leaflet integration + right rail.
// Wrapped in <Suspense> because MapScreen uses useSearchParams (for the
// "?from=fema" intent handoff) — Next 16 enforces this for static prerender.

import { Suspense } from 'react';

import { Shell } from '@/components/Shell';
import { MapScreen } from '@/components/map/MapScreen';

export default function MapPage() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <MapScreen />
      </Suspense>
    </Shell>
  );
}

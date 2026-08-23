// MapScreen owns the leaflet integration and the right rail. It needs a
// Suspense boundary because it reads useSearchParams for the "?from=fema"
// handoff, which Next 16 requires for static prerender.

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

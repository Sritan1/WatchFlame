// Fire-detail route — /fire-detail?lat=…&lon=…&brightness=…&confidence=…&
// acq_date=…&acq_time=…&satellite=…&daynight=…
//
// One unified screen for both FIRMS satellite pixels AND named NIFC/Cal Fire
// incidents — matches mobile app/fire-detail.tsx 1:1. The screen looks up
// named incidents within 10 mi of (lat, lon) and renders the incident
// metadata block when a match is found.
//
// Wrapped in <Suspense> because FireDetailScreen reads URL params via
// useSearchParams, which Next 16 requires under a Suspense boundary.

import { Suspense } from 'react';

import { Shell } from '@/components/Shell';
import { FireDetailScreen } from '@/components/fire-detail/FireDetailScreen';

export default function FireDetailPage() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <FireDetailScreen />
      </Suspense>
    </Shell>
  );
}

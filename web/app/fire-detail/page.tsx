// One screen for both satellite pixels and named incidents. Reads the pixel off the
// query string, then looks for a nearby named incident. The Suspense boundary is what
// Next requires around the useSearchParams read inside FireDetailScreen.

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

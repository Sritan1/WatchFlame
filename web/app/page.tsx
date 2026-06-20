// Status route — orchestrated by StatusScreen (client component)
// because every panel reads from TanStack Query hooks + browser geolocation.
// The Shell layer stays server-rendered.

import { Shell } from '@/components/Shell';
import { StatusScreen } from '@/components/status/StatusScreen';

export default function CommandCenterPage() {
  return (
    <Shell>
      <StatusScreen />
    </Shell>
  );
}

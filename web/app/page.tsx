// StatusScreen runs on the client because every panel reads a query hook and
// browser geolocation. Shell stays server-rendered.

import { Shell } from '@/components/Shell';
import { StatusScreen } from '@/components/status/StatusScreen';

export default function CommandCenterPage() {
  return (
    <Shell>
      <StatusScreen />
    </Shell>
  );
}

// SafetyScreen owns the checklist state, the evac mode and the data hooks.

import { Shell } from '@/components/Shell';
import { SafetyScreen } from '@/components/safety/SafetyScreen';

export default function SafetyPage() {
  return (
    <Shell>
      <SafetyScreen />
    </Shell>
  );
}

// Safety Plan route. SafetyScreen owns checklist state + evac mode + hook orchestration.

import { Shell } from '@/components/Shell';
import { SafetyScreen } from '@/components/safety/SafetyScreen';

export default function SafetyPage() {
  return (
    <Shell>
      <SafetyScreen />
    </Shell>
  );
}

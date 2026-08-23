// RiskScreen owns the input state and the risk hook.

import { Shell } from '@/components/Shell';
import { RiskScreen } from '@/components/risk/RiskScreen';

export default function RiskPage() {
  return (
    <Shell>
      <RiskScreen />
    </Shell>
  );
}

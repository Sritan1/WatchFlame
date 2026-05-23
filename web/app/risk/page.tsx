// Risk Forecast route. RiskScreen owns input state + the risk hook.

import { Shell } from '@/components/Shell';
import { RiskScreen } from '@/components/risk/RiskScreen';

export default function RiskPage() {
  return (
    <Shell>
      <RiskScreen />
    </Shell>
  );
}

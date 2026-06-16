import { describe, expect, it } from 'vitest';

import { computeConfidence } from '@/lib/confidence';

describe('computeConfidence', () => {
  it('short-circuits to a null level while loading (no flash of HIGH CONFIDENCE)', () => {
    const r = computeConfidence({
      weatherUpdatedAt: 0,
      weatherLoading: true,
      riskData: undefined,
      riskLoading: true,
      threatDriver: null,
    });
    expect(r.level).toBeNull();
    expect(r.loading).toBe(true);
  });

  it('returns a non-loading, resolved level when /risk errored (riskData === null)', () => {
    const r = computeConfidence({
      weatherUpdatedAt: Date.now(),
      weatherLoading: false,
      riskData: null,
      riskLoading: false,
      threatDriver: null,
    });
    expect(r.loading).toBe(false);
    expect(r.level).not.toBeNull();
  });
});

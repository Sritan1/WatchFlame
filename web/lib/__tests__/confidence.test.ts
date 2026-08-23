import { describe, expect, it } from 'vitest';

import type { RiskResponse } from '@/lib/api';
import { computeConfidence } from '@/lib/confidence';

// Minimal RiskResponse builder. Only kbdi and ndvi_anomaly matter here, the
// rest is there to satisfy the type.
function riskWith(over: Partial<RiskResponse>): RiskResponse {
  return {
    risk_score: 0.4,
    danger_level: 'MODERATE',
    factors: { vpd: 0.5, wind: 0.5, drought: 0.5, season: 0.9 },
    kbdi: 320,
    ndvi_anomaly: -0.05,
    ...over,
  };
}

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

  it('resolves to LOW (never a confident level) when /risk errored (riskData === null)', () => {
    const r = computeConfidence({
      weatherUpdatedAt: Date.now(),
      weatherLoading: false,
      riskData: null,
      riskLoading: false,
      threatDriver: null,
    });
    expect(r.loading).toBe(false);
    // Must be LOW. A risk-endpoint failure should never render a confident chip.
    expect(r.level).toBe('low');
  });

  it('is HIGH when every input is fresh and present', () => {
    const r = computeConfidence({
      weatherUpdatedAt: Date.now(), // fresh observation
      weatherLoading: false,
      riskData: riskWith({ kbdi: 320, ndvi_anomaly: -0.05 }),
      riskLoading: false,
      threatDriver: null,
    });
    expect(r.level).toBe('high');
  });

  it('drops to MEDIUM on a single estimated signal (one warn)', () => {
    const r = computeConfidence({
      weatherUpdatedAt: Date.now(),
      weatherLoading: false,
      riskData: riskWith({ kbdi: null, ndvi_anomaly: -0.05 }), // KBDI estimated
      riskLoading: false,
      threatDriver: null,
    });
    expect(r.level).toBe('medium');
  });

  it('drops to LOW when two signals are estimated (weakest-link)', () => {
    const r = computeConfidence({
      weatherUpdatedAt: Date.now(),
      weatherLoading: false,
      riskData: riskWith({ kbdi: null, ndvi_anomaly: null }), // KBDI and NDVI estimated
      riskLoading: false,
      threatDriver: null,
    });
    expect(r.level).toBe('low');
  });
});

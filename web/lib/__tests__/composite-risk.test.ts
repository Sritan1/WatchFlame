import { describe, expect, it } from 'vitest';

import type { FireFeature, NamedIncident } from '@/lib/api';
import {
  aggregateThreat,
  bucketOf,
  compositeFromBuckets,
  envFromBuckets,
  fireThreatFactor,
  findThreatDriver,
  firmsAgeHours,
  normalizeWeather,
} from '@/lib/composite-risk';

describe('bucketOf', () => {
  it('maps a normalized 0-1 score to a tier', () => {
    expect(bucketOf(0.1)).toBe('low');
    expect(bucketOf(0.4)).toBe('moderate');
    expect(bucketOf(0.6)).toBe('high');
    expect(bucketOf(0.9)).toBe('extreme');
  });
});

describe('normalizeWeather', () => {
  it('guards NaN / non-positive scores to 0 (no false CRITICAL on bad data)', () => {
    expect(normalizeWeather(NaN, null)).toBe(0);
    expect(normalizeWeather(-1, null)).toBe(0);
    expect(normalizeWeather(0, null)).toBe(0);
  });
  it('is monotonic in the raw score', () => {
    expect(normalizeWeather(0.5, null)).toBeGreaterThan(normalizeWeather(0.2, null));
  });
});

describe('envFromBuckets (Stage 1: weather ⊗ ignition)', () => {
  it('returns null when weather is not ready', () => {
    expect(envFromBuckets(null, 'high')).toBeNull();
  });
  it('degrades to the weather bucket when ignition is absent', () => {
    expect(envFromBuckets('high', null)).toBe('high');
  });
  it('caps an off-diagonal corner: low severity tempers extreme ignition', () => {
    expect(envFromBuckets('low', 'extreme')).toBe('moderate');
    expect(envFromBuckets('extreme', 'extreme')).toBe('extreme');
  });
  it('is symmetric in its two inputs', () => {
    expect(envFromBuckets('moderate', 'extreme')).toBe(envFromBuckets('extreme', 'moderate'));
  });
});

describe('compositeFromBuckets (Stage 2: env × threat)', () => {
  it('returns null when the environmental tier is not ready', () => {
    expect(compositeFromBuckets(null, 'high')).toBeNull();
  });
  it('produces a valid tier when threat is absent', () => {
    expect(['low', 'moderate', 'high', 'extreme']).toContain(
      compositeFromBuckets('extreme', null),
    );
  });
});

describe('fireThreatFactor', () => {
  const base = {
    acres: 500,
    firmsAgeHours: null,
    windDeg: null,
    bearingToFireDeg: 0,
    windSpeedKph: null,
  };
  it('a closer fire is more threatening than a far one', () => {
    expect(fireThreatFactor({ ...base, distanceMi: 5 })).toBeGreaterThan(
      fireThreatFactor({ ...base, distanceMi: 40 }),
    );
  });
  it('containment dampens threat', () => {
    expect(fireThreatFactor({ ...base, distanceMi: 5, containedPct: 90 })).toBeLessThan(
      fireThreatFactor({ ...base, distanceMi: 5, containedPct: 0 }),
    );
  });
  it('wind alignment modulates threat', () => {
    const a = fireThreatFactor({ ...base, distanceMi: 10, windDeg: 180, windSpeedKph: 30 });
    const b = fireThreatFactor({ ...base, distanceMi: 10, windDeg: 0, windSpeedKph: 30 });
    expect(a).not.toBe(b);
  });
});

describe('firmsAgeHours', () => {
  it('parses acq_date + acq_time as UTC into fractional hours', () => {
    const now = Date.parse('2026-06-16T12:00:00Z');
    expect(firmsAgeHours('2026-06-16', '1000', now)).toBeCloseTo(2, 5);
  });
  it('left-pads short times and returns null without a date', () => {
    const now = Date.parse('2026-06-16T01:00:00Z');
    expect(firmsAgeHours('2026-06-16', '30', now)).toBeCloseTo(0.5, 5); // 00:30
    expect(firmsAgeHours(null, '1200', now)).toBeNull();
  });
});

describe('aggregateThreat / findThreatDriver', () => {
  const userLoc = { lat: 37.0, lon: -120.0 };
  const incident = {
    id: '1',
    name: 'Test Fire',
    lat: 37.05,
    lon: -120.0,
    distance_mi: 4,
    acres: 1000,
    contained_pct: 0,
  } as NamedIncident;
  const noWind = { windDeg: null, windSpeedKph: null };

  it('is 0 / null when no fires are in range', () => {
    expect(
      aggregateThreat({ userLoc, namedIncidents: [], firmsHits: [], ...noWind }),
    ).toBe(0);
    expect(
      findThreatDriver({ userLoc, namedIncidents: [], firmsHits: [], ...noWind }),
    ).toBeNull();
  });

  it('aggregate threat exactly equals the driving fire’s factor (single source of truth)', () => {
    const args = {
      userLoc,
      namedIncidents: [incident],
      firmsHits: [] as FireFeature[],
      ...noWind,
    };
    const agg = aggregateThreat(args);
    const driver = findThreatDriver(args);
    expect(agg).toBeGreaterThan(0);
    expect(driver?.threat).toBeCloseTo(agg, 10);
  });
});

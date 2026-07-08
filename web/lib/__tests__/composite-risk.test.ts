import { describe, expect, it } from 'vitest';

import type { FireFeature, NamedIncident } from '@/lib/api';
import {
  aggregateThreat,
  bucketOf,
  compositeFromBuckets,
  compositeSubtitle,
  envFromBuckets,
  fireThreatFactor,
  findThreatDriver,
  firmsAgeHours,
  normalizeWeather,
} from '@/lib/composite-risk';
import type { RiskLevel } from '@/lib/theme';

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
  it('wind aligned toward the fire bearing raises threat above wind opposed to it', () => {
    // base.bearingToFireDeg = 0, so windDeg 0 is aligned (delta 0 → ×(1+WIND_REL))
    // and windDeg 180 is opposed (delta 180 → ×(1-WIND_REL)). Asserting direction,
    // not just inequality, catches a flipped cos sign.
    const aligned = fireThreatFactor({ ...base, distanceMi: 10, windDeg: 0, windSpeedKph: 30 });
    const opposed = fireThreatFactor({ ...base, distanceMi: 10, windDeg: 180, windSpeedKph: 30 });
    expect(aligned).toBeGreaterThan(opposed);
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

describe('compositeSubtitle', () => {
  const tiers: RiskLevel[] = ['low', 'moderate', 'high', 'extreme'];
  const threats: (RiskLevel | null)[] = [null, 'low', 'moderate', 'high', 'extreme'];

  it('never contradicts the headline tier (call to action matches the orb)', () => {
    // Drive the subtitle across every (weather, ignition, threat) combination
    // and assert the call to action tracks the SAME tier the orb shows:
    // Review your plan on HIGH/EXTREME, Stay aware on MODERATE, neither on LOW.
    // The old subtitle keyed on raw weather and could understate an
    // ignition-escalated headline; this guards that it can't.
    for (const weatherBucket of tiers) {
      for (const ignitionBucket of tiers) {
        const envBucket = envFromBuckets(weatherBucket, ignitionBucket)!;
        for (const threatBucket of threats) {
          const tier = compositeFromBuckets(envBucket, threatBucket)!;
          const s = compositeSubtitle({ envBucket, weatherBucket, ignitionBucket, threatBucket });
          const where = `env=${envBucket} threat=${threatBucket}`;
          if (tier === 'high' || tier === 'extreme') {
            expect(s, where).toContain('Review your plan');
          } else if (tier === 'moderate') {
            expect(s, where).toContain('Stay aware');
          } else {
            expect(s, where).not.toContain('Review your plan');
            expect(s, where).not.toContain('Stay aware');
          }
        }
      }
    }
  });

  it('names ignition as the driver when it escalates the environment', () => {
    // weather MODERATE but ignition EXTREME -> env HIGH -> headline HIGH.
    const envBucket = envFromBuckets('moderate', 'extreme')!;
    expect(envBucket).toBe('high');
    const s = compositeSubtitle({
      envBucket,
      weatherBucket: 'moderate',
      ignitionBucket: 'extreme',
      threatBucket: 'moderate',
    });
    expect(s).toContain('primed for ignition');
    expect(s).toContain('Review your plan');
  });

  it('explains why an extreme environment with no fire stays moderate', () => {
    const s = compositeSubtitle({
      envBucket: 'extreme',
      weatherBucket: 'extreme',
      ignitionBucket: 'extreme',
      threatBucket: null,
    });
    expect(s).toContain('no active fires are nearby');
    expect(s).toContain('Stay aware');
  });
});

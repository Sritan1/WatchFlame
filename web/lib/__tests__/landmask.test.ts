import { describe, expect, it } from 'vitest';

import { isOnLand } from '@/lib/landmask';

describe('isOnLand (coarse US land polygon)', () => {
  it('classifies inland points as land', () => {
    expect(isOnLand(37.8716, -122.2727)).toBe(true); // Berkeley, CA
    expect(isOnLand(38.5816, -121.4944)).toBe(true); // Sacramento, CA
    expect(isOnLand(39.7392, -104.9903)).toBe(true); // Denver, CO
    expect(isOnLand(32.7767, -96.797)).toBe(true); // Dallas, TX
  });

  it('classifies open-ocean points as water', () => {
    expect(isOnLand(36.0, -124.0)).toBe(false); // Pacific, off central CA
    expect(isOnLand(35.0, -140.0)).toBe(false); // mid-Pacific
    expect(isOnLand(40.0, -72.0)).toBe(false); // Atlantic, off NY/NJ
    expect(isOnLand(27.0, -84.0)).toBe(false); // Gulf of Mexico
  });

  it('returns false outside the bundled US bounding box', () => {
    expect(isOnLand(51.5074, -0.1278)).toBe(false); // London (outside bbox)
    expect(isOnLand(-33.8688, 151.2093)).toBe(false); // Sydney
  });
});

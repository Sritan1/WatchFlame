import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Shelter } from '@/lib/api';
import { resolveEvacDestination } from '@/lib/evac';
import { isOnLand } from '@/lib/landmask';

// Mock the land check so the fallback chain is deterministic. The real polygon
// is covered by landmask.test.ts. isOnLand is called in order: primary, +arc,
// -arc — so mockReturnValueOnce sequences drive each branch.
vi.mock('@/lib/landmask', () => ({ isOnLand: vi.fn() }));
const mockLand = vi.mocked(isOnLand);

beforeEach(() => mockLand.mockReset());

const ORIGIN = { lat: 0, lon: 0 };
const AWAY = 90; // escape due east

function shelter(lat: number, lon: number, distance_mi: number): Shelter {
  return {
    id: `${lat},${lon}`,
    name: 'Test',
    lat,
    lon,
    type: 'community_centre',
    distance_mi,
    address: null,
    activated: false,
  };
}

describe('resolveEvacDestination', () => {
  it('uses the straight-away point when it is on land (primary)', () => {
    mockLand.mockReturnValue(true);
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, undefined);
    expect(r.kind).toBe('primary');
    expect(r.bearing).toBe(90);
    expect(mockLand).toHaveBeenCalledTimes(1); // stops at primary
  });

  it('rotates +60° when the straight-away point is water', () => {
    mockLand.mockReturnValueOnce(false).mockReturnValueOnce(true); // primary water, +60 land
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, undefined);
    expect(r.kind).toBe('rotated');
    if (r.kind === 'rotated') {
      expect(r.rotationDeg).toBe(60);
      expect(r.bearing).toBe(150);
    }
  });

  it('rotates -60° when +60° is also water', () => {
    mockLand.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, undefined);
    expect(r.kind).toBe('rotated');
    if (r.kind === 'rotated') {
      expect(r.rotationDeg).toBe(-60);
      expect(r.bearing).toBe(30);
    }
  });

  it('routes to the nearest shelter in the ±60° arc when all points are water', () => {
    mockLand.mockReturnValue(false);
    const shelters = [
      shelter(0, 1.0, 69), // due east (bearing 90) — in arc
      shelter(0, 0.5, 35), // due east, closer — in arc, should win
      shelter(1, 0, 69), // due north (bearing 0) — out of arc, excluded
    ];
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, shelters);
    expect(r.kind).toBe('shelter');
    if (r.kind === 'shelter') expect(r.shelter.distance_mi).toBe(35);
  });

  it('falls back to direction-only when no shelter is in the arc', () => {
    mockLand.mockReturnValue(false);
    // only a shelter due north (out of the ±60° away arc)
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, [shelter(1, 0, 20)]);
    expect(r.kind).toBe('direction');
    expect(r.bearing).toBe(90);
  });

  it('falls back to direction-only when there are no shelters at all', () => {
    mockLand.mockReturnValue(false);
    const r = resolveEvacDestination(ORIGIN, AWAY, 50, []);
    expect(r.kind).toBe('direction');
  });
});

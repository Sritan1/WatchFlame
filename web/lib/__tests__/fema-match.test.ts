import { describe, expect, it } from 'vitest';

import type { NamedIncident } from '@/lib/api';
import { matchIncidentByFemaTitle } from '@/lib/fema-match';

const inc = (name: string): NamedIncident => ({ id: name, name }) as NamedIncident;

describe('matchIncidentByFemaTitle', () => {
  const fires = [inc('Park Fire'), inc('Cow Creek Fire'), inc('Creek Fire')];

  it('resolves a title to its incident after stripping the "Fire" suffix', () => {
    expect(matchIncidentByFemaTitle('Park Fire', fires)?.name).toBe('Park Fire');
  });

  it('prefers the higher-overlap match, not a coincidental short name', () => {
    // "Cow Creek" (2 shared tokens) must beat the unrelated "Creek Fire" (1).
    expect(matchIncidentByFemaTitle('Cow Creek Fire', fires)?.name).toBe('Cow Creek Fire');
  });

  it('prefers the most specific match over a broader superset name', () => {
    // "Canyon Fire" must land on "Canyon Fire", not the superset
    // "Grand Canyon Complex" (same shared token, but extra noise).
    const fires2 = [inc('Grand Canyon Complex'), inc('Canyon Fire')];
    expect(matchIncidentByFemaTitle('Canyon Fire', fires2)?.name).toBe('Canyon Fire');
  });

  it('ignores too-short tokens and returns null when nothing matches', () => {
    expect(matchIncidentByFemaTitle('Oak Fire', [inc('The Big One')])).toBeNull();
  });
});

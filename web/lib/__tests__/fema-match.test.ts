import { describe, expect, it } from 'vitest';

import type { NamedIncident } from '@/lib/api';
import { matchIncidentByFemaTitle } from '@/lib/fema-match';

const inc = (name: string): NamedIncident => ({ id: name, name }) as NamedIncident;

describe('matchIncidentByFemaTitle', () => {
  const fires = [inc('Park Fire'), inc('Cow Creek Fire'), inc('Creek Fire')];

  it('resolves a title to its incident after stripping the "Fire" suffix', () => {
    expect(matchIncidentByFemaTitle('Park Fire', fires)?.name).toBe('Park Fire');
  });

  it('prefers the longest word-boundary match, not a loose substring', () => {
    // "Cow Creek" must not collapse onto the unrelated, shorter "Creek Fire".
    expect(matchIncidentByFemaTitle('Cow Creek Fire', fires)?.name).toBe('Cow Creek Fire');
  });

  it('ignores too-short tokens and returns null when nothing matches', () => {
    expect(matchIncidentByFemaTitle('Oak Fire', [inc('The Big One')])).toBeNull();
  });
});

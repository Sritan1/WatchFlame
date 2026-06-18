import { describe, expect, it } from 'vitest';

import { firmsPlatform, satelliteTitle } from '@/lib/firms';

describe('firmsPlatform', () => {
  it('maps the default VIIRS S-NPP code "N" to a friendly name', () => {
    expect(firmsPlatform('N')).toBe('Suomi NPP');
  });

  it('maps the other known platform codes', () => {
    expect(firmsPlatform('N20')).toBe('NOAA-20');
    expect(firmsPlatform('J1')).toBe('NOAA-20');
    expect(firmsPlatform('T')).toBe('Terra');
    expect(firmsPlatform('A')).toBe('Aqua');
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(firmsPlatform(' terra ')).toBe('Terra');
    expect(firmsPlatform('aqua')).toBe('Aqua');
  });

  it('returns null for empty or unknown codes', () => {
    expect(firmsPlatform(null)).toBeNull();
    expect(firmsPlatform(undefined)).toBeNull();
    expect(firmsPlatform('')).toBeNull();
    expect(firmsPlatform('XYZ')).toBeNull();
  });
});

describe('satelliteTitle', () => {
  it('builds a "<platform> detection" title for known codes', () => {
    expect(satelliteTitle('N')).toBe('Suomi NPP detection');
  });

  it('falls back to a clean generic that never exposes the raw code', () => {
    expect(satelliteTitle('XYZ')).toBe('Satellite detection');
    expect(satelliteTitle(null)).toBe('Satellite detection');
  });
});

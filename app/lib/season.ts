import type { Season } from './types';

/** Northern-hemisphere meteorological season for a given date. */
export function currentSeason(date: Date = new Date()): Season {
  const m = date.getMonth() + 1; // 1-12
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'fall';
}

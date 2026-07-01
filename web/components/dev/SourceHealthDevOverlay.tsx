'use client';

// DEV-ONLY. Lets you see every source-health indicator without breaking a real
// upstream: add a `?health=` param to any page and the listed sources are
// forced "down" in the store. Mounted from the root layout behind a
// NODE_ENV !== 'production' guard, so it is tree-shaken out of prod builds.
//
//   ?health=firms                     → FIRMS down
//   ?health=calfire                   → "Cal Fire down, only showing NIFC…"
//   ?health=nifc,calfire              → both incident feeds down
//   ?health=maptiler                  → "Map tiles failed to load"
//   ?health=fema                      → "FEMA status unavailable"
//   ?health=census                    → "Couldn't confirm your county…"
//   ?health=shelters_nces             → one shelter source down
//   ?health=shelters_open,shelters_osm,shelters_nces → all shelters down
//   ?health=trajectory                → Status "Forecast unavailable"
//
// A bare key means "down"; use key:ok to clear one. Removing the param clears
// all overrides.

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { parseHealthParam, setSourceHealthOverrides } from '@/lib/sourceHealth';

export function SourceHealthDevOverlay() {
  const params = useSearchParams();
  const raw = params.get('health') ?? '';
  useEffect(() => {
    setSourceHealthOverrides(raw ? parseHealthParam(raw) : {});
  }, [raw]);
  return null;
}

// Confidence calculation for the Status composite tier.
//
// The composite tier is derived from multiple upstream signals (weather
// observation, KBDI drought integrator, NDVI vegetation anomaly,
// per-state calibration, driving-fire age). Each has independent
// reliability characteristics. This module turns "what's the state of
// each input?" into a single user-facing confidence label and an
// itemized breakdown for the click-to-expand modal.
//
// Composition rule is weakest-link: any signal in 'bad' status pushes
// the composite to LOW; two or more 'warn' statuses also push to LOW;
// one 'warn' is MEDIUM; all 'good' is HIGH. Calibration is treated as
// informational only — global fallback shows up in the breakdown but
// doesn't drag the composite level down (the algorithm runs cleanly on
// global cutoffs).
//
// Pure functions, no React, easy to unit-test.

import type { RiskResponse } from '@/lib/api';
import type { ThreatDriver } from '@/lib/composite-risk';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type SignalStatus = 'good' | 'warn' | 'bad';

export interface ConfidenceSignal {
  /** Short human label for the breakdown row. */
  label: string;
  /** Right-aligned value text: "8 min ago", "California (per-state)", etc. */
  value: string;
  status: SignalStatus;
  /** Whether this signal contributes to the composite level. False = the
   *  signal appears in the breakdown for context but is informational only
   *  (e.g. calibration source). */
  contributesToLevel: boolean;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  signals: ConfidenceSignal[];
  /** True when at least one input is still resolving — caller should
   *  render the chip as a skeleton rather than a stale level. */
  loading: boolean;
}

// ─── Thresholds ──────────────────────────────────────────────────────────

/** Weather observation freshness — TanStack `dataUpdatedAt` driven. */
const WEATHER_GOOD_MIN = 30;
const WEATHER_WARN_MIN = 90;

/** Driving fire (FIRMS satellite pixel) age thresholds. */
const FIRMS_GOOD_HR = 6;
const FIRMS_WARN_HR = 24; // matches STALE_FIRMS_HOURS in composite-risk

// ─── Helpers ─────────────────────────────────────────────────────────────

function minutesAgo(timestampMs: number | null, nowMs: number): number | null {
  if (timestampMs == null || timestampMs === 0) return null;
  return Math.max(0, (nowMs - timestampMs) / 60_000);
}

function ageLabel(minutes: number | null): string {
  if (minutes == null) return 'unknown';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hr ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} ago`;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function computeConfidence(args: {
  /** TanStack's `dataUpdatedAt` for the /weather query. 0 = never resolved. */
  weatherUpdatedAt: number | null;
  /** Whether the /weather query is still in its first fetch. */
  weatherLoading: boolean;
  /** The /risk response body, or undefined while loading. */
  riskData: RiskResponse | null | undefined;
  riskLoading: boolean;
  /** The fire driving the threat axis (named or FIRMS); null when none. */
  threatDriver: ThreatDriver | null;
  /** Override "now" for testability. Defaults to Date.now(). */
  nowMs?: number;
}): ConfidenceResult {
  const now = args.nowMs ?? Date.now();
  const signals: ConfidenceSignal[] = [];
  let warns = 0;
  let bads = 0;

  // Loading short-circuit — render skeleton, not stale level.
  if (args.weatherLoading || args.riskLoading || args.riskData === undefined) {
    return { level: 'high', signals: [], loading: true };
  }

  // 1. Weather observation freshness
  const wMin = minutesAgo(args.weatherUpdatedAt, now);
  let wStatus: SignalStatus;
  let wValue: string;
  if (wMin == null) {
    wStatus = 'bad';
    wValue = 'unavailable';
  } else if (wMin < WEATHER_GOOD_MIN) {
    wStatus = 'good';
    wValue = ageLabel(wMin);
  } else if (wMin < WEATHER_WARN_MIN) {
    wStatus = 'warn';
    wValue = ageLabel(wMin);
  } else {
    wStatus = 'bad';
    wValue = ageLabel(wMin);
  }
  signals.push({
    label: 'Weather observation',
    value: wValue,
    status: wStatus,
    contributesToLevel: true,
  });
  if (wStatus === 'warn') warns++;
  if (wStatus === 'bad') bads++;

  // 2. KBDI (drought integrator)
  const kbdi = args.riskData?.kbdi;
  if (kbdi == null) {
    signals.push({
      label: 'KBDI (drought)',
      value: 'days-since-rain proxy',
      status: 'warn',
      contributesToLevel: true,
    });
    warns++;
  } else {
    signals.push({
      label: 'KBDI (drought)',
      value: `value: ${Math.round(kbdi)}`,
      status: 'good',
      contributesToLevel: true,
    });
  }

  // 3. NDVI (vegetation anomaly)
  const ndvi = args.riskData?.ndvi_anomaly;
  if (ndvi == null) {
    signals.push({
      label: 'NDVI (vegetation)',
      value: 'season multiplier fallback',
      status: 'warn',
      contributesToLevel: true,
    });
    warns++;
  } else {
    const sign = ndvi >= 0 ? '+' : '';
    signals.push({
      label: 'NDVI (vegetation)',
      value: `anomaly ${sign}${ndvi.toFixed(2)}`,
      status: 'good',
      contributesToLevel: true,
    });
  }

  // 4. Calibration source (informational — doesn't gate the level)
  const calibrated = args.riskData?.regional_thresholds != null;
  signals.push({
    label: 'Calibration',
    value: calibrated
      ? `${args.riskData?.regional_state ?? 'state'} (per-state)`
      : 'global fallback',
    status: calibrated ? 'good' : 'warn',
    contributesToLevel: false,
  });

  // 5. Driving fire (only when a fire is driving the threat axis)
  const driver = args.threatDriver;
  if (driver?.kind === 'firms') {
    const ageHr = driver.ageHours;
    let fStatus: SignalStatus;
    let fValue: string;
    if (ageHr == null) {
      fStatus = 'warn';
      fValue = 'satellite detection, age unknown';
    } else if (ageHr < FIRMS_GOOD_HR) {
      fStatus = 'good';
      fValue = `FIRMS, ${Math.round(ageHr)} hr ago`;
    } else if (ageHr < FIRMS_WARN_HR) {
      fStatus = 'warn';
      fValue = `FIRMS, ${Math.round(ageHr)} hr ago`;
    } else {
      fStatus = 'bad';
      fValue = `FIRMS, ${Math.round(ageHr)} hr ago (stale)`;
    }
    signals.push({
      label: 'Driving fire',
      value: fValue,
      status: fStatus,
      contributesToLevel: true,
    });
    if (fStatus === 'warn') warns++;
    if (fStatus === 'bad') bads++;
  } else if (driver?.kind === 'incident') {
    signals.push({
      label: 'Driving fire',
      value: `${driver.incident.name} (named incident)`,
      status: 'good',
      contributesToLevel: true,
    });
  }
  // No driver → no row added; threat axis is just "no fire in range."

  // Composite level — weakest link.
  let level: ConfidenceLevel;
  if (bads > 0 || warns >= 2) level = 'low';
  else if (warns === 1) level = 'medium';
  else level = 'high';

  return { level, signals, loading: false };
}

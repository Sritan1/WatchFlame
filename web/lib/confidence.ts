// Confidence calculation for the Status composite tier.
//
// The composite tier is derived from multiple upstream signals (weather
// observation, KBDI drought integrator, NDVI vegetation anomaly,
// driving-fire age). Each has independent reliability characteristics. This
// module turns "what's the state of each input?" into a single user-facing
// confidence label and an itemized breakdown for the click-to-expand modal.
//
// Composition rule is weakest-link: any signal in 'bad' status pushes
// the composite to LOW. Two or more 'warn' statuses also push to LOW.
// One 'warn' is MEDIUM. All 'good' is HIGH.
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
}

export interface ConfidenceResult {
  /** Null while loading or when no determinate confidence can be computed.
   *  Distinct from 'low' / 'medium' / 'high' so consumers must handle the
   *  "no answer yet" case explicitly rather than silently rendering one
   *  of the three semantic levels as a placeholder. */
  level: ConfidenceLevel | null;
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
  if (timestampMs == null || !Number.isFinite(timestampMs) || timestampMs === 0) {
    return null;
  }
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

/** Sub-1-hour FIRMS ages need finer granularity than `Math.round(hours)` —
 *  a 20-minute-old detection should read "20 min ago", not "0 hr ago". */
function firmsAgeLabel(ageHr: number): string {
  if (ageHr < 1) {
    const minutes = Math.round(ageHr * 60);
    if (minutes < 1) return 'satellite, just now';
    return `satellite, ${minutes} min ago`;
  }
  return `satellite, ${Math.round(ageHr)} hr ago`;
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

  // Loading short-circuit — render skeleton, not stale level. `level: null`
  // (not 'high') so any consumer that ignores the loading flag still doesn't
  // see a misleadingly-confident placeholder.
  if (args.weatherLoading || args.riskLoading || args.riskData === undefined) {
    return { level: null, signals: [], loading: true };
  }

  // /risk errored — distinguished from "loading" (riskData === undefined)
  // and "succeeded" (riskData is a value). Show a single "Risk endpoint"
  // bad-status row so the user sees the actual failure mode rather than
  // three misleading-fallback warns for KBDI / NDVI / Calibration.
  if (args.riskData === null) {
    const wMinErr = minutesAgo(args.weatherUpdatedAt, now);
    const errSignals: ConfidenceSignal[] = [];
    if (wMinErr != null) {
      errSignals.push({
        label: 'Weather observation',
        value: ageLabel(wMinErr),
        status: wMinErr < WEATHER_GOOD_MIN ? 'good' : wMinErr < WEATHER_WARN_MIN ? 'warn' : 'bad',      });
    }
    errSignals.push({
      label: 'Risk data',
      value: 'unavailable',
      status: 'bad',    });
    return { level: 'low', signals: errSignals, loading: false };
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
    status: wStatus,  });
  if (wStatus === 'warn') warns++;
  if (wStatus === 'bad') bads++;

  // 2. KBDI (drought integrator) — Number.isFinite guard catches NaN values
  // that would otherwise slip into the 'good' branch and render "value: NaN".
  const kbdi = args.riskData?.kbdi;
  if (kbdi == null || !Number.isFinite(kbdi)) {
    signals.push({
      label: 'Drought (KBDI)',
      value: 'estimated',
      status: 'warn',    });
    warns++;
  } else {
    signals.push({
      label: 'Drought (KBDI)',
      value: `${Math.round(kbdi)}`,
      status: 'good',    });
  }

  // 3. NDVI (vegetation anomaly) — same NaN guard as KBDI
  const ndvi = args.riskData?.ndvi_anomaly;
  if (ndvi == null || !Number.isFinite(ndvi)) {
    signals.push({
      label: 'Vegetation (NDVI)',
      value: 'estimated',
      status: 'warn',    });
    warns++;
  } else {
    const sign = ndvi >= 0 ? '+' : '';
    signals.push({
      label: 'Vegetation (NDVI)',
      value: `${sign}${ndvi.toFixed(2)}`,
      status: 'good',    });
  }

  // 4. Driving fire (only when a fire is driving the threat axis)
  const driver = args.threatDriver;
  if (driver?.kind === 'firms') {
    const ageHr = driver.ageHours;
    let fStatus: SignalStatus;
    let fValue: string;
    if (ageHr == null || !Number.isFinite(ageHr)) {
      fStatus = 'warn';
      fValue = 'satellite detection, age unknown';
    } else if (ageHr < FIRMS_GOOD_HR) {
      fStatus = 'good';
      fValue = firmsAgeLabel(ageHr);
    } else if (ageHr < FIRMS_WARN_HR) {
      fStatus = 'warn';
      fValue = firmsAgeLabel(ageHr);
    } else {
      fStatus = 'bad';
      fValue = `${firmsAgeLabel(ageHr)} (stale)`;
    }
    signals.push({
      label: 'Driving fire',
      value: fValue,
      status: fStatus,    });
    if (fStatus === 'warn') warns++;
    if (fStatus === 'bad') bads++;
  } else if (driver?.kind === 'incident') {
    signals.push({
      label: 'Driving fire',
      value: `${driver.incident.name} (named incident)`,
      status: 'good',    });
  }
  // No driver → no row added; threat axis is just "no fire in range."

  // Composite level — weakest link.
  let level: ConfidenceLevel;
  if (bads > 0 || warns >= 2) level = 'low';
  else if (warns === 1) level = 'medium';
  else level = 'high';

  return { level, signals, loading: false };
}

// How much to trust the Status tier. Weighs the freshness of the weather reading,
// KBDI, the NDVI anomaly and the driving fire's age. Weakest link decides. Any bad
// signal or two warnings means low, one warning is medium, all clean is high.

import type { RiskResponse } from '@/lib/api';
import type { ThreatDriver } from '@/lib/composite-risk';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type SignalStatus = 'good' | 'warn' | 'bad';

export interface ConfidenceSignal {
  /** Row label in the breakdown. */
  label: string;
  /** The value shown on the right, like "8 min ago". */
  value: string;
  status: SignalStatus;
}

export interface ConfidenceResult {
  /** Null while loading, kept separate from the three real levels so a caller can't
   *  show one as a placeholder. */
  level: ConfidenceLevel | null;
  signals: ConfidenceSignal[];
  /** An input is still resolving, so show a skeleton, not a stale level. */
  loading: boolean;
}

/** How old a weather reading can get, in minutes. */
const WEATHER_GOOD_MIN = 30;
const WEATHER_WARN_MIN = 90;

/** Same for a satellite detection, in hours. */
const FIRMS_GOOD_HR = 6;
const FIRMS_WARN_HR = 24; // matches STALE_FIRMS_HOURS in composite-risk

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

/** Rounding hours would show a 20-minute-old detection as "0 hr ago". */
function firmsAgeLabel(ageHr: number): string {
  if (ageHr < 1) {
    const minutes = Math.round(ageHr * 60);
    if (minutes < 1) return 'satellite, just now';
    return `satellite, ${minutes} min ago`;
  }
  return `satellite, ${Math.round(ageHr)} hr ago`;
}

export function computeConfidence(args: {
  /** When /weather last resolved. 0 means it never has. */
  weatherUpdatedAt: number | null;
  /** True during the first /weather fetch. */
  weatherLoading: boolean;
  /** The /risk body, or undefined while it loads. */
  riskData: RiskResponse | null | undefined;
  riskLoading: boolean;
  /** The fire driving the threat axis, null when there isn't one. */
  threatDriver: ThreatDriver | null;
  /** Override "now" in tests. */
  nowMs?: number;
}): ConfidenceResult {
  const now = args.nowMs ?? Date.now();
  const signals: ConfidenceSignal[] = [];
  let warns = 0;
  let bads = 0;

  // Null rather than 'high', so a caller ignoring the loading flag can't render a
  // confident-looking placeholder.
  if (args.weatherLoading || args.riskLoading || args.riskData === undefined) {
    return { level: null, signals: [], loading: true };
  }

  // /risk failed (null here, undefined means loading). One honest "unavailable"
  // row beats three warnings that all really say the same thing.
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

  // The isFinite check stops a NaN reaching the 'good' branch and rendering as
  // literally "NaN".
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

  // Only when a fire is actually driving the threat axis.
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
  // With no driver there is no row, since nothing is in range to rate.

  let level: ConfidenceLevel;
  if (bads > 0 || warns >= 2) level = 'low';
  else if (warns === 1) level = 'medium';
  else level = 'high';

  return { level, signals, loading: false };
}

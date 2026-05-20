import { Text, View } from 'react-native';

import { AnimatedNumber } from './AnimatedNumber';
import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { Skeleton } from './Skeleton';

type Bucket = { label: string; color: string };

// Thresholds match the CalibrationModal text on Status. Negative = drier
// than normal (raises fire risk); positive = greener than normal.
function ndviBucket(anomaly: number): Bucket {
  if (anomaly <= -0.10) return { label: 'Much drier than normal',  color: '#ef4444' };
  if (anomaly <= -0.03) return { label: 'Drier than normal',       color: '#fb923c' };
  if (anomaly <   0.03) return { label: 'About normal',            color: '#9ca3af' };
  if (anomaly <   0.10) return { label: 'Greener than normal',     color: '#7ee787' };
  return                       { label: 'Much greener than normal',color: '#7ee787' };
}

/** "Vegetation Stress" card — satellite NDVI anomaly read from CDSE. Sister
 *  card to LocalKbdiCard. Sits directly below it on Status.
 *
 *  - `ndviAnomaly` is the (current − climatology) value in NDVI units
 *    (typically −0.30…+0.30). Negative = drier vegetation than normal.
 *  - `isLoading` distinguishes "still fetching" from "fetched but no data";
 *    the latter renders an explicit unavailable state instead of a skeleton.
 */
export function LocalNdviCard({
  ndviAnomaly,
  isLoading = false,
}: {
  ndviAnomaly: number | null;
  isLoading?: boolean;
}) {
  const loaded = ndviAnomaly != null;
  const bucket = loaded ? ndviBucket(ndviAnomaly) : null;
  const sign = loaded && ndviAnomaly >= 0 ? '+' : '';

  return (
    <Card tone="black">
      <Eyebrow>Vegetation stress</Eyebrow>

      {loaded && bucket ? (
        <>
          <View className="mt-3 flex-row items-baseline">
            <Text className="text-3xl font-extrabold text-chalk-50">{sign}</Text>
            <AnimatedNumber
              value={ndviAnomaly}
              format={(n) => n.toFixed(3)}
              className="text-3xl font-extrabold text-chalk-50"
            />
            <Text className="ml-2 text-xs text-chalk-400">NDVI anomaly</Text>
          </View>
          <Text
            className="mt-1 text-xs font-semibold uppercase tracking-[2px]"
            style={{ color: bucket.color }}
          >
            {bucket.label}
          </Text>
          <Text className="mt-3 text-[11px] text-chalk-500">
            Sentinel-2 satellite, 1 km buffer. How much drier or greener the
            vegetation around you is right now versus the same calendar month
            over the last 3 years.
          </Text>
        </>
      ) : isLoading ? (
        <>
          {/* Same skeleton rhythm as LocalKbdiCard — a number block then a
           *  smaller label block, with the descriptive footer staying visible. */}
          <View className="mt-3">
            <Skeleton width={180} height={32} rounded="md" />
          </View>
          <View className="mt-3">
            <Skeleton width={140} height={12} rounded="sm" />
          </View>
          <Text className="mt-3 text-[11px] text-chalk-500">
            Sentinel-2 satellite, 1 km buffer. How much drier or greener the
            vegetation around you is right now versus the same calendar month
            over the last 3 years.
          </Text>
        </>
      ) : (
        <>
          <Text className="mt-3 text-sm text-chalk-100">
            Satellite imagery unavailable.
          </Text>
          <Text className="mt-2 text-[11px] text-chalk-500">
            Likely cloud cover over the last several Sentinel-2 passes, or
            outside the Sentinel-2 archive. The risk score falls back to a
            calendar-season vegetation multiplier when this happens.
          </Text>
        </>
      )}
    </Card>
  );
}

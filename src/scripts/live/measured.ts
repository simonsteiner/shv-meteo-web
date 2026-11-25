// When a station measured what it shows, and whether that is too old to
// pass for current. Upstream's current measurements include stations whose
// latest values are hours old (on 2026-11-25, 127 of 3,795 over an hour
// behind the newest). Pure.
import type { MeasurementFeature } from "../types.ts";

/** Older than this, a measurement is shown greyed out. */
export const MAX_AGE_MS = 3_600_000;

const isTime = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** The time (ms since the epoch) of the station's wind, which pilots read
 * first, else of its temperature, else the newest of its `*Time` fields;
 * null without any. */
export function measurementTime(
  p: MeasurementFeature["properties"],
): number | null {
  const props = p as Record<string, unknown>;
  for (const key of ["windSpeedTime", "temperature2mTime", "temperatureTime"])
    if (isTime(props[key])) return props[key] as number;
  let newest: number | null = null;
  for (const [key, v] of Object.entries(props))
    if (key.endsWith("Time") && isTime(v) && (newest === null || v > newest))
      newest = v;
  return newest;
}

/** Whether a measurement at `t` is over MAX_AGE_MS old at `now`. */
export function isOldMeasurement(t: number | null, now: number): boolean {
  return t !== null && now - t > MAX_AGE_MS;
}

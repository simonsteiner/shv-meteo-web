// skybriefing's DABS publication schedule (skybriefing.com/dabs): version 1
// of the next day's bulletin daily at 16:00 local time; updates (version
// 2, 3, 4) for the current day, in force at once, at 09:00, 13:00 and
// 16:00. The card shows the schedule and the next publication, and the
// link to tomorrow's PDF only from 16:00 Swiss time, before which what it
// serves is unknown. Nothing is fetched: these are skybriefing's published
// times, not a bulletin's status. Pure.
import { swissHour, swissTime } from "../swiss-time.ts";

/** When version 1 of the next day's bulletin comes out, Swiss time. */
export const DABS_FIRST_VERSION = "16:00";

/** When the current day's bulletin is updated, Swiss time. */
export const DABS_UPDATES = ["09:00", "13:00", "16:00"] as const;

/** Whether tomorrow's DABS is published at `now` (ms since the epoch). */
export function tomorrowPublished(now: number): boolean {
  return swissHour(now) >= Number(DABS_FIRST_VERSION.slice(0, 2));
}

/** The next scheduled publication after `now`, Swiss time: whether it
 * brings the next day's version 1, and whether it falls tomorrow (after
 * 16:00 it is the next morning's 09:00 update). */
export function nextPublication(now: number): {
  time: string;
  nextDay: boolean;
  tomorrow: boolean;
} {
  const hhmm = swissTime(now);
  const later = DABS_UPDATES.find((t) => t > hhmm);
  const time = later ?? DABS_UPDATES[0];
  return {
    time,
    nextDay: time === DABS_FIRST_VERSION,
    tomorrow: later === undefined,
  };
}

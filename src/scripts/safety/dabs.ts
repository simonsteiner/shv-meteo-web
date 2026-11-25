// When tomorrow's DABS is out. skybriefing.com/dabs publishes version 1 of
// the next day's bulletin daily at 16:00 local time (updates for the
// current day follow at 09:00, 13:00 and 16:00), so the card shows the link
// to tomorrow's PDF only from 16:00 Swiss time; before that what the link
// serves is unknown. Pure.
import { swissHour } from "../swiss-time.ts";

/** The Swiss hour from which tomorrow's bulletin is published. */
const PUBLISHED_HOUR = 16;

/** Whether tomorrow's DABS is published at `now` (ms since the epoch). */
export function tomorrowPublished(now: number): boolean {
  return swissHour(now) >= PUBLISHED_HOUR;
}

// Every time the app shows is Swiss time (Europe/Zurich), whatever the
// device's own zone: a pilot abroad planning a Swiss flight reads the same
// hours as one at home, and the emagram, the station chart, the outlooks,
// the Föhn history and the measurement times all agree. Pure.

const ZONE = "Europe/Zurich";

const HHMM = new Intl.DateTimeFormat("de-CH", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** HH:MM of `ms` in Swiss time. */
export function swissTime(ms: number): string {
  return HHMM.format(new Date(ms));
}

/** The hour (0 to 23) of `ms` in Swiss time. */
export function swissHour(ms: number): number {
  return Number(swissTime(ms).slice(0, 2));
}

/** `ms` formatted in `locale` with `options`, in Swiss time. */
export function formatSwiss(
  ms: number,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: ZONE }).format(
    new Date(ms),
  );
}

/** A naive Zurich time as upstream's outlooks send it
 * (`2026-11-25T06:00`, no offset), read as text: its day in `locale`
 * ("Mi., 25.11.") and its HH:MM as given, never shifted by the device's
 * zone. Null for anything else. */
export function naiveSwiss(
  text: string,
  locale: string,
): { day: string; time: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  // the calendar day alone, at noon UTC, formatted in UTC: no zone moves it
  const noon = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(noon));
  return { day, time: `${m[4]}:${m[5]}` };
}

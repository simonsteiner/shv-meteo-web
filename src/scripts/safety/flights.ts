// The flight log: entries the pilot types in, kept in localStorage
// (`shv_flights`, src/scripts/settings.ts). Older entries carry a `type`
// and `maxAlt` the form no longer asks for; they show when present. An
// entry that isn't a flight is skipped with a log, so a hand-edited store
// never breaks the page.

export interface Flight {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** The take-off. */
  site: string;
  landing: string;
  glider: string;
  /** Minutes in the air. */
  duration: number;
  /** Cross-country distance in km. */
  distance: number | null;
  /** Highest altitude in m, on older entries only. */
  maxAlt: number | null;
  notes: string;
  /** On older entries only, e.g. "Thermikflug". */
  type: string | null;
}

export const MAX_DURATION = 1200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** A stored entry as a flight, else null. */
export function readFlight(v: unknown): Flight | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const date = text(r.date);
  const site = text(r.site);
  const duration = num(r.duration);
  if (!date || !site || duration === null || duration < 0) return null;
  return {
    id: text(r.id) || `${date}-${site}`,
    date,
    site,
    landing: text(r.landing) ?? "",
    glider: text(r.glider) ?? "",
    duration: Math.round(duration),
    distance: num(r.distance),
    maxAlt: num(r.maxAlt),
    notes: text(r.notes) ?? "",
    type: text(r.type) || null,
  };
}

/** The stored entries that are flights, in their order. */
export function readFlights(entries: readonly unknown[]): Flight[] {
  const flights: Flight[] = [];
  entries.forEach((entry, i) => {
    const flight = readFlight(entry);
    if (flight) flights.push(flight);
    else console.error(`[safety] Skipping flight log entry ${i}:`, entry);
  });
  return flights;
}

/** A new flight from the form's fields, or null when one is missing or
 * out of range (the form's own checks normally stop that first). */
export function flightFromForm(
  get: (name: string) => string | null,
  id: string,
): Flight | null {
  const field = (name: string) => (get(name) ?? "").trim();
  const date = field("date");
  const site = field("site");
  const landing = field("landing");
  const glider = field("glider");
  const duration = Number(field("duration"));
  const distanceText = field("distance");
  const distance = distanceText === "" ? null : Number(distanceText);
  if (!DATE.test(date) || !site || !landing || !glider) return null;
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION)
    return null;
  if (distance !== null && !(Number.isFinite(distance) && distance >= 0))
    return null;
  return {
    id,
    date,
    site,
    landing,
    glider,
    duration,
    distance,
    maxAlt: null,
    notes: field("notes"),
    type: null,
  };
}

export interface FlightStats {
  count: number;
  /** Total airtime in minutes. */
  totalMinutes: number;
  /** The longest flight in minutes; 0 with no flights. */
  longestMinutes: number;
}

export function flightStats(flights: readonly Flight[]): FlightStats {
  return {
    count: flights.length,
    totalMinutes: flights.reduce((sum, f) => sum + f.duration, 0),
    longestMinutes: flights.reduce((max, f) => Math.max(max, f.duration), 0),
  };
}

/** Minutes as the stats bar shows them: "3h 25m". */
export function formatAirtime(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** A day in the browser's time zone as YYYY-MM-DD, as a date input wants
 * it; `toISOString` would give the UTC day, yesterday before 01:00 in
 * Swiss winter. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

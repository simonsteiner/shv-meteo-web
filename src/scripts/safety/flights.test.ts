import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flightFromForm,
  flightStats,
  formatAirtime,
  localDate,
  readFlight,
  readFlights,
  type Flight,
} from "./flights.ts";

const legacy = {
  id: "f-1",
  date: "2026-07-14",
  site: "Fiescheralp",
  landing: "Fiesch",
  glider: "Mentor 7",
  duration: 95,
  distance: 25.4,
  notes: "Gute Thermik",
  type: "Thermikflug",
};

test("readFlight keeps an entry the old view stored", () => {
  assert.deepEqual(readFlight(legacy), {
    ...legacy,
    maxAlt: null,
  });
});

test("readFlight reads numbers stored as text and fills what's missing", () => {
  assert.deepEqual(
    readFlight({ date: "2026-07-14", site: "Niesen", duration: "45" }),
    {
      id: "2026-07-14-Niesen",
      date: "2026-07-14",
      site: "Niesen",
      landing: "",
      glider: "",
      duration: 45,
      distance: null,
      maxAlt: null,
      notes: "",
      type: null,
    },
  );
});

test("readFlight rejects what isn't a flight", () => {
  assert.equal(readFlight(null), null);
  assert.equal(readFlight("flight"), null);
  assert.equal(readFlight({ ...legacy, site: "" }), null);
  assert.equal(readFlight({ ...legacy, duration: "long" }), null);
  assert.equal(readFlight({ ...legacy, duration: -5 }), null);
});

test("readFlights skips bad entries with a log and keeps the order", () => {
  const original = console.error;
  const errors: unknown[] = [];
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const flights = readFlights([legacy, 42, { ...legacy, id: "f-2" }]);
    assert.deepEqual(
      flights.map((f) => f.id),
      ["f-1", "f-2"],
    );
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});

const form = (fields: Record<string, string>) => (name: string) =>
  fields[name] ?? null;
const filled = {
  date: "2026-07-14",
  duration: "60",
  site: " Brunni ",
  landing: "Engelberg",
  glider: "Rush 6",
  distance: "",
  notes: "",
};

test("flightFromForm builds a flight from the fields, trimmed", () => {
  assert.deepEqual(flightFromForm(form(filled), "f-9"), {
    id: "f-9",
    date: "2026-07-14",
    site: "Brunni",
    landing: "Engelberg",
    glider: "Rush 6",
    duration: 60,
    distance: null,
    maxAlt: null,
    notes: "",
    type: null,
  });
  assert.equal(
    flightFromForm(form({ ...filled, distance: "12.5" }), "f")?.distance,
    12.5,
  );
});

test("flightFromForm rejects missing or out-of-range fields", () => {
  for (const bad of [
    { date: "14.07.2026" },
    { site: "  " },
    { glider: "" },
    { duration: "0" },
    { duration: "1201" },
    { duration: "4.5" },
    { distance: "-1" },
    { distance: "far" },
  ])
    assert.equal(flightFromForm(form({ ...filled, ...bad }), "f"), null);
});

test("flightStats sums the airtime and finds the longest flight", () => {
  const flights = [95, 30, 140].map(
    (duration) => ({ ...readFlight(legacy), duration }) as Flight,
  );
  assert.deepEqual(flightStats(flights), {
    count: 3,
    totalMinutes: 265,
    longestMinutes: 140,
  });
  assert.deepEqual(flightStats([]), {
    count: 0,
    totalMinutes: 0,
    longestMinutes: 0,
  });
});

test("formatAirtime splits minutes into hours and minutes", () => {
  assert.equal(formatAirtime(265), "4h 25m");
  assert.equal(formatAirtime(0), "0h 0m");
});

test("localDate gives the local day, zero-padded", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 0, 30)), "2026-01-05");
  assert.equal(localDate(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

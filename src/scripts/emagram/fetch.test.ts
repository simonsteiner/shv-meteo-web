import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { soundingRoute } from "./fetch.ts";
import { GRID } from "./grid.ts";
import { BROKEN, COLUMN, pointAnswer } from "./point.fixture.ts";
import { soundingFromForecast } from "./sounding.ts";

/** The catalogue's Disentis/Mustér grid point, as the Function imports it. */
const DISENTIS = GRID["disentis/mustér"];
assert.ok(
  DISENTIS,
  "the generated grid lost disentis/mustér: point these tests at another station",
);
const POINT = DISENTIS.pointIndex;

const ctx = (path: string) =>
  ({
    request: new Request(
      `https://shv-meteo.pages.dev/api/meteo/previtemps/forecast/${path}`,
    ),
    env: {},
    params: { name: path },
    waitUntil: () => {},
  }) satisfies Context;

/** Upstream lists its runs newest first, as on 2026-11-23:
 * `{"runs":[1795435200000,1795413600000]}` (12 and 06 UTC). */
const RUNS = [3, 2, 1];

/** A series still being written: every humidity value null. */
const NO_HUMIDITY = {
  ...COLUMN,
  specific_humidity: [null, null, null, null],
} as unknown as Record<string, number[]>;

/** Upstream listing runs 3, 2, 1 and answering each point with `column`,
 * except a 404 for any URL holding `failing`; `runs` is the listed order. */
function fakeFetch(
  calls: string[],
  failing = "",
  column = COLUMN,
  runs = RUNS,
) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (failing && url.includes(failing))
      return new Response("", { status: 404 });
    if (url.endsWith("/runs")) return Response.json({ runs });
    return Response.json(pointAnswer(column));
  }) as typeof fetch;
}

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

test("a catalogue name with a slash returns the latest run's point data as upstream sent it", async () => {
  const calls: string[] = [];
  const res = await soundingRoute(
    ctx("Disentis%2FMust%C3%A9r"),
    fakeFetch(calls),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "max-age=1200");
  assert.equal(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  const { name, model, elevation, latitude, longitude } = DISENTIS;
  assert.deepEqual(body.station, {
    name,
    model,
    elevation,
    latitude,
    longitude,
  });
  assert.equal(body.run, 3);
  assert.deepEqual(body.point, pointAnswer());
  // the runs list, then all six series in one call
  assert.deepEqual(calls.slice(1), [
    `https://weather-ws-prod.ubmeteo.io/v1/point-data/${DISENTIS.modelKey}/3/${POINT}?parameters=temperature,pressure,specific_humidity,height_half_level,wind_u,wind_v`,
  ]);
  // and the browser makes the sounding from it
  const sounding = soundingFromForecast(body);
  assert.equal(sounding.stationName, DISENTIS.name);
  assert.equal(sounding.elevation, Math.round(DISENTIS.elevation));
  assert.equal(sounding.timeSteps.length, 2);
  assert.equal(sounding.timeSteps[1].levels.length, 3);
  assert.deepEqual(sounding.timeSteps[1].levels[0], {
    heightM: 1200,
    pressHpa: 950,
    tempC: 10,
    dewC: 3.1,
    speedKmH: 0,
    dirDeg: 180,
    lapseRate: 0,
  });
});

test("the newest run is taken whatever order upstream lists them in", async () => {
  const res = await soundingRoute(
    ctx("Disentis%2FMust%C3%A9r"),
    fakeFetch([], "", COLUMN, [1, 3, 2]),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).run, 3);
});

test("a newest run without data falls back to the one before", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    soundingRoute(ctx("Disentis%2FMust%C3%A9r"), fakeFetch(calls, "/3/")),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).run, 2);
  // the runs list, run 3, run 2
  assert.equal(calls.length, 3);
});

test("an unknown name is a 404 without an upstream call", async () => {
  const calls: string[] = [];
  const res = await soundingRoute(ctx("Atlantis"), fakeFetch(calls));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: "Unbekannte Sondierungsstation",
  });
  assert.equal(calls.length, 0);
});

test("a run without one complete level is the route's 503", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    soundingRoute(
      ctx("Disentis%2FMust%C3%A9r"),
      fakeFetch(calls, "", NO_HUMIDITY),
    ),
  );
  assert.equal(res.status, 503);
  // the runs list, then runs 3 and 2: neither has a complete level, and
  // run 1 is never asked for
  assert.equal(calls.length, 3);
  assert.ok(!calls.some((u) => u.includes("/1/")));
});

test("a failed point fetch is the route's 503", async () => {
  const res = await quietly(() =>
    soundingRoute(ctx("disentis%2Fmust%C3%A9r"), fakeFetch([], `/${POINT}?`)),
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Sondierung vorübergehend nicht erreichbar",
  });
});

test("a column that is no atmosphere is the route's 503", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    soundingRoute(ctx("Disentis%2FMust%C3%A9r"), fakeFetch(calls, "", BROKEN)),
  );
  assert.equal(res.status, 503);
  // the runs list, then the newest two runs (3 and 2) before giving up;
  // run 1 is never asked for
  assert.equal(calls.length, 3);
  assert.ok(!calls.some((u) => u.includes("/1/")));
});

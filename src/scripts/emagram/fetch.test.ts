import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context, PrevitempsGrid } from "../types.ts";
import { soundingRoute } from "./fetch.ts";

const grid: PrevitempsGrid = {
  "disentis/mustér": {
    name: "Disentis/Mustér",
    modelKey: "meteo_swiss:icon_ch1",
    model: "ICON-CH1",
    pointIndex: 42,
    elevation: 1130.4,
    latitude: 46.7,
    longitude: 8.85,
  },
};

const ctx = (path: string) =>
  ({
    request: new Request(
      `https://shv-meteo.pages.dev/api/meteo/previtemps/forecast/${path}`,
    ),
    env: {},
    params: { name: path },
    waitUntil: () => {},
  }) satisfies Context;

const series = (value: number | null, times: number) => ({
  validTimes: [0, 3_600_000].slice(0, times),
  data: {
    levels: [{ ensembleMembers: [{ timeSeries: Array(times).fill(value) }] }],
  },
});

/** Upstream lists its runs newest first, as on 2026-11-23:
 * `{"runs":[1795435200000,1795413600000]}` (12 and 06 UTC). */
const RUNS = [3, 2, 1];

function fakeFetch(calls: string[], failing = "", empty = "", runs = RUNS) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (failing && url.includes(failing))
      return new Response("", { status: 404 });
    if (url.endsWith("/runs")) return Response.json({ runs });
    const value: Record<string, number> = {
      temperature: 283.15,
      pressure: 95000,
      specific_humidity: 0.005,
      height_half_level: 1200,
      wind_u: 0,
      wind_v: 0,
    };
    const param = url.split("/").at(-2) ?? "";
    // `empty`: a series still being written, every value null
    if (param === empty) return Response.json(series(null, 2));
    return Response.json(series(value[param], 2));
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

test("a catalogue name with a slash returns the sounding from the latest run", async () => {
  const calls: string[] = [];
  const res = await soundingRoute(
    ctx("Disentis%2FMust%C3%A9r"),
    grid,
    fakeFetch(calls),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "max-age=1200");
  const body = await res.json();
  assert.equal(body.stationName, "Disentis/Mustér");
  assert.equal(body.run, 3);
  assert.equal(body.elevation, 1130);
  assert.equal(body.timeSteps.length, 2);
  assert.deepEqual(body.timeSteps[1].levels[0], {
    levelIndex: 0,
    heightM: 1200,
    pressHpa: 950,
    tempC: 10,
    dewC: 3.1,
    speedKmH: 0,
    dirDeg: 180,
    lapseRate: 0,
  });
  assert.equal(calls.length, 7);
  assert.ok(
    calls.includes(
      "https://weather-ws-prod.ubmeteo.io/v1/point-data/meteo_swiss:icon_ch1/3/wind_v/42",
    ),
  );
});

test("the newest run is taken whatever order upstream lists them in", async () => {
  const res = await soundingRoute(
    ctx("Disentis%2FMust%C3%A9r"),
    grid,
    fakeFetch([], "", "", [1, 3, 2]),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).run, 3);
});

test("a newest run without data falls back to the one before", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    soundingRoute(ctx("Disentis%2FMust%C3%A9r"), grid, fakeFetch(calls, "/3/")),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).run, 2);
  // the runs list, run 3's six series, run 2's six series
  assert.equal(calls.length, 13);
});

test("an unknown name is a 404 without an upstream call", async () => {
  const calls: string[] = [];
  const res = await soundingRoute(ctx("Atlantis"), grid, fakeFetch(calls));
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
      grid,
      fakeFetch(calls, "", "specific_humidity"),
    ),
  );
  assert.equal(res.status, 503);
  // the runs list, then six series for each of the three runs: none has a
  // complete level, so each falls back to the one before
  assert.equal(calls.length, 19);
});

test("a failed point fetch is the route's 503", async () => {
  const res = await quietly(() =>
    soundingRoute(
      ctx("disentis%2Fmust%C3%A9r"),
      grid,
      fakeFetch([], "/wind_u/"),
    ),
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Sondierung vorübergehend nicht erreichbar",
  });
});

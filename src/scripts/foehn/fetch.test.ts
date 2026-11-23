import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { serve } from "../upstream/respond.ts";
import {
  foehnResponse,
  measurementsUrl,
  seriesUrl,
  stationsByParameter,
} from "./fetch.ts";
import { STATION_POSITIONS } from "./pairs.ts";

const NOW = new Date("2026-11-23T12:00:00Z");

/** Upstream's property for each parameter the pairs read. */
const PROPERTY: Record<string, string> = {
  pressure_msl: "pressureMslValue",
  temperature: "temperature2mValue",
};

/** Values for the stations these tests give one; the rest answer 1000. */
const VALUES: Record<string, number> = {
  "meteo_swiss:GVE": 1021,
  "meteo_swiss:GUT": 1014,
};

/** What a measurements URL asks for. */
function request(url: string) {
  const q = new URL(url).searchParams;
  const n = (k: string) => Number(q.get(k));
  return {
    parameter: q.get("parameters") ?? "",
    minLat: n("minLat"),
    minLon: n("minLon"),
    maxLat: n("maxLat"),
    maxLon: n("maxLon"),
  };
}

const inside = (url: string, [lon, lat]: [number, number]) => {
  const r = request(url);
  return lat > r.minLat && lat < r.maxLat && lon > r.minLon && lon < r.maxLon;
};

/** A fetch that answers each measurements call with the pair stations in
 * its box (all but `missing`), carrying only the asked parameter; `status`
 * for the `failing` parameter's call; and fails every series. */
function fakeFetch(
  options: { failing?: string; missing?: string } = {},
  calls: string[] = [],
) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (!url.includes("/measurements/current"))
      return new Response("down", { status: 500 });
    const { parameter } = request(url);
    if (parameter === options.failing)
      return new Response("bad gateway", { status: 502 });
    const features = Object.entries(STATION_POSITIONS)
      .filter(([id, pos]) => id !== options.missing && inside(url, pos))
      .map(([id, coordinates]) => ({
        id,
        geometry: { type: "Point", coordinates },
        properties: { name: id, [PROPERTY[parameter]]: VALUES[id] ?? 1000 },
      }));
    return Response.json({ type: "FeatureCollection", features });
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

test("one call per parameter, its box holding its stations", () => {
  const groups = stationsByParameter();
  assert.deepEqual([...groups.keys()], ["pressure_msl", "temperature"]);
  assert.deepEqual(groups.get("temperature"), [
    "meteo_swiss:PIL",
    "meteo_swiss:MTR",
  ]);
  assert.equal(groups.get("pressure_msl")?.length, 6);
  for (const [parameter, ids] of groups) {
    const url = measurementsUrl(parameter, ids);
    assert.equal(request(url).parameter, parameter);
    for (const id of ids) assert.ok(inside(url, STATION_POSITIONS[id]), id);
  }
});

test("a failed series gives history [] with a 200", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    foehnResponse("GVE_GUT", fakeFetch({}, calls), () => NOW),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.history, []);
  assert.equal(body.pairs.length, 4);
  assert.equal(
    body.pairs.find((p: { id: string }) => p.id === "GVE_GUT").delta,
    7,
  );
  // two filtered measurements calls and the pair's two series
  assert.equal(calls.length, 4);
  assert.ok(
    calls
      .filter((u) => u.includes("/measurements/current"))
      .every((u) => u.includes("&parameters=")),
  );
  // the series start 25 hours back, not upstream's default 14 days
  const since = NOW.getTime() - 25 * 3600 * 1000;
  assert.ok(
    calls.includes(seriesUrl("meteo_swiss:GVE", "pressure_msl", since)),
  );
  assert.ok(
    calls.some((u) => u.endsWith(`?parameters=pressure_msl&start=${since}`)),
  );
});

test("a station missing from its answer leaves out its pair only", async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  try {
    const res = await foehnResponse(
      "KLO_LUG",
      fakeFetch({ missing: "meteo_swiss:MTR" }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(
      body.pairs.map((p: { id: string }) => p.id),
      ["KLO_LUG", "GVE_GUT", "DEM_GRE"],
    );
    assert.ok(
      errors.some((e) => e.includes("temperature for meteo_swiss:MTR")),
    );
  } finally {
    console.error = original;
  }
});

test("a failed measurements call gives the route's 503", async () => {
  const ctx = {
    request: new Request("https://shv-meteo.pages.dev/api/foehn?pair=x"),
    env: {},
    params: {},
    waitUntil: () => {},
  } satisfies Context;
  let pairSeen = "";
  const res = await quietly(() =>
    serve(
      "foehn",
      ctx,
      ({ pair }) => (
        (pairSeen = pair),
        foehnResponse(pair, fakeFetch({ failing: "temperature" }))
      ),
      undefined,
    ),
  );
  assert.equal(pairSeen, "KLO_LUG");
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), {
    error: "Föhndaten vorübergehend nicht erreichbar",
  });
});

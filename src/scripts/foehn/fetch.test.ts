import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { serve } from "../upstream/respond.ts";
import { foehnResponse, SWISS_MEASUREMENTS_URL } from "./fetch.ts";

const measurements = {
  features: [
    {
      id: "meteo_swiss:KLO",
      geometry: { type: "Point", coordinates: [8.5, 47.5] },
      properties: { pressureMslValue: 1021 },
    },
    {
      id: "meteo_swiss:LUG",
      geometry: { type: "Point", coordinates: [8.9, 46] },
      properties: { pressureMslValue: 1014 },
    },
  ],
};

/** A fetch that answers the measurements and fails every series. */
function fakeFetch(measurementsStatus: number, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === SWISS_MEASUREMENTS_URL)
      return Response.json(measurements, { status: measurementsStatus });
    return new Response("down", { status: 500 });
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

test("a failed series gives history [] with a 200", async () => {
  const calls: string[] = [];
  const res = await quietly(() =>
    foehnResponse("GVE_GUT", fakeFetch(200, calls)),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.history, []);
  assert.equal(body.primaryPair.diffHpa, -7);
  assert.equal(calls.length, 3);
  assert.ok(
    calls.some((u) => u.includes("meteo_swiss%3AGVE?parameters=pressure_msl")),
  );
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
      ({ pair }) => ((pairSeen = pair), foehnResponse(pair, fakeFetch(502))),
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

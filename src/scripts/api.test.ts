import assert from "node:assert/strict";
import { test } from "node:test";
import { isobarenUrl, OUTLOOKS_URL, ShvApi } from "./api.ts";
import { pointAnswer } from "./emagram/point.fixture.ts";

test("getFoehn() twice makes one fetch, getFoehn('GVE_GUT') a second", async () => {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Response.json({ history: [] });
  }) as typeof fetch;
  try {
    await Promise.all([
      ShvApi.getFoehn(),
      ShvApi.getFoehn(),
      ShvApi.getFoehn("KLO_LUG"),
    ]);
    assert.deepEqual(calls, ["/api/foehn?pair=KLO_LUG"]);
    await ShvApi.getFoehn("GVE_GUT");
    assert.deepEqual(calls, [
      "/api/foehn?pair=KLO_LUG",
      "/api/foehn?pair=GVE_GUT",
    ]);
    await Promise.all([ShvApi.getMeasurements(), ShvApi.getMeasurements()]);
    assert.equal(calls.filter((u) => u === "/api/measurements").length, 1);
  } finally {
    globalThis.fetch = real;
  }
});

/** Runs `body` with `fetch` answered by `answer`, console quiet; returns
 * the URLs fetched. */
async function withFetch(
  answer: (url: string) => Response | Promise<Response>,
  body: () => Promise<void>,
): Promise<string[]> {
  const calls: string[] = [];
  const real = {
    fetch: globalThis.fetch,
    warn: console.warn,
    error: console.error,
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return answer(String(input));
  }) as typeof fetch;
  console.warn = () => {};
  console.error = () => {};
  try {
    await body();
  } finally {
    globalThis.fetch = real.fetch;
    console.warn = real.warn;
    console.error = real.error;
  }
  return calls;
}

test("a failed Foehn call is not kept: the next getFoehn asks again", async () => {
  let fail = true;
  const calls = await withFetch(
    () =>
      fail
        ? new Response("{}", { status: 503 })
        : Response.json({ history: [1] }),
    async () => {
      assert.equal(await ShvApi.getFoehn("DEM_GRE"), null);
      fail = false;
      assert.deepEqual(await ShvApi.getFoehn("DEM_GRE"), { history: [1] });
      assert.deepEqual(await ShvApi.getFoehn("DEM_GRE"), { history: [1] });
    },
  );
  assert.deepEqual(calls, [
    "/api/foehn?pair=DEM_GRE",
    "/api/foehn?pair=DEM_GRE",
  ]);
});

test("getEmagramForecast builds the sounding, or null when it can't", async () => {
  const station = {
    name: "Interlaken",
    model: "ICON-CH1",
    elevation: 576.6,
    latitude: 46.68,
    longitude: 7.86,
  };
  let answer: Response = new Response("{}", { status: 503 });
  const calls = await withFetch(
    () => answer,
    async () => {
      assert.equal(await ShvApi.getEmagramForecast("Interlaken"), null);
      answer = Response.json({ station, run: 1, point: pointAnswer() });
      const sounding = await ShvApi.getEmagramForecast("Interlaken");
      assert.equal(sounding?.stationName, "Interlaken");
      assert.equal(sounding?.timeSteps[0].levels.length, 3);
      // an answer in another shape (an old cached copy): no point data
      answer = Response.json({ stationName: "Interlaken", timeSteps: [] });
      assert.equal(await ShvApi.getEmagramForecast("Interlaken"), null);
    },
  );
  assert.equal(calls[0], "/api/meteo/previtemps/forecast/Interlaken");
});

test("a snapshot falls back to the CDN once, and retries after both fail", async () => {
  const sites = await withFetch(
    (url) =>
      url.startsWith("/")
        ? new Response("", { status: 404 })
        : Response.json({ type: "FeatureCollection", features: [] }),
    async () => {
      await Promise.all([ShvApi.getFlyingSites(), ShvApi.getFlyingSites()]);
      await ShvApi.getFlyingSites();
    },
  );
  assert.deepEqual(sites, [
    "/data/flyingsites.geojson",
    "https://shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson",
  ]);

  let down = true;
  const airspaces = await withFetch(
    () =>
      down
        ? new Response("", { status: 500 })
        : Response.json({ type: "FeatureCollection", features: [] }),
    async () => {
      assert.equal(await ShvApi.getAirspaces(), null);
      down = false;
      assert.deepEqual((await ShvApi.getAirspaces())?.features, []);
    },
  );
  assert.equal(airspaces.length, 3);
});

test("en gets the German isobar chart, fr and it keep theirs", () => {
  const base = "https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/";
  assert.equal(isobarenUrl("en"), `${base}de.svg`);
  assert.equal(isobarenUrl("de"), `${base}de.svg`);
  assert.equal(isobarenUrl("fr"), `${base}fr.svg`);
  assert.equal(isobarenUrl("it"), `${base}it.svg`);
  assert.equal(isobarenUrl("../x"), `${base}de.svg`);
});

test("the outlooks come from upstream", () => {
  assert.match(OUTLOOKS_URL, /^https:\/\/static-prod\.ubmeteo\.io\//);
});

test("getObstacles says when its index or a cell failed, and answers null for an abort", async (t) => {
  t.mock.method(console, "error", () => {});
  const view = { minLon: 8, minLat: 46.5, maxLon: 8.1, maxLat: 46.6, zoom: 13 };
  const index = { generatedAt: "", tiers: { z13: ["32_186"] } };
  const cell = { type: "FeatureCollection", features: [] };
  let answers: Record<string, unknown> = {};
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted)
      throw new DOMException("The operation was aborted.", "AbortError");
    const body = answers[String(input)];
    return body === undefined
      ? new Response("missing", { status: 404 })
      : Response.json(body);
  }) as typeof fetch;
  try {
    // no index: nothing drawn, and said
    assert.equal(await ShvApi.getObstacles(view), null);
    // the index came, its cell failed
    answers = { "/data/obstacles/index.json": index };
    assert.equal((await ShvApi.getObstacles(view))?.incomplete, true);
    const abort = new AbortController();
    abort.abort();
    assert.equal(
      await ShvApi.getObstacles(view, { signal: abort.signal }),
      null,
    );
    answers = { "/data/obstacles/z13/32_186.json": cell };
    assert.equal((await ShvApi.getObstacles(view))?.incomplete, false);
  } finally {
    globalThis.fetch = real;
  }
});

test("an answer says when it was fetched and whether it is a stand-in", async () => {
  let answer = 0;
  await withFetch(
    (url) =>
      url === "/api/webcams"
        ? Response.json(
            { webcams: [] },
            {
              headers:
                answer++ === 0
                  ? { "x-fetched-at": "1795625400000", "x-cache": "stale" }
                  : { "x-fetched-at": "1795626000000", "x-cache": "miss" },
            },
          )
        : Response.json({}),
    async () => {
      const stale = await ShvApi.getWebcams();
      assert.deepEqual(ShvApi.freshness(stale), {
        fetchedAt: 1795625400000,
        stale: true,
      });
      const fresh = await ShvApi.getWebcams();
      assert.deepEqual(ShvApi.freshness(fresh), {
        fetchedAt: 1795626000000,
        stale: false,
      });
      // a static file carries neither header
      const outlooks = await ShvApi.getOutlooks();
      assert.equal(ShvApi.freshness(outlooks), null);
      assert.equal(ShvApi.freshness(null), null);
    },
  );
});

test("a fresh getMeasurements asks again, and later reads share its answer", async () => {
  let n = 0;
  const calls = await withFetch(
    () => Response.json({ type: "FeatureCollection", features: [], n: ++n }),
    async () => {
      const first = await ShvApi.getMeasurements();
      assert.equal(await ShvApi.getMeasurements(), first);
      const fresh = await ShvApi.getMeasurements({ fresh: true });
      assert.notEqual(fresh, first);
      assert.equal(await ShvApi.getMeasurements(), fresh);
    },
  );
  assert.ok(calls.filter((u) => u === "/api/measurements").length >= 1);
  assert.equal(calls.filter((u) => u === "/api/measurements").length, n);
});

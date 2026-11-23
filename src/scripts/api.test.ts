import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDabs, isobarenUrl, OUTLOOKS_URL, ShvApi } from "./api.ts";

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
      await assert.rejects(ShvApi.getAirspaces());
      down = false;
      assert.deepEqual((await ShvApi.getAirspaces()).features, []);
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

test("buildDabs returns the former /api/dabs fields for the date", () => {
  assert.deepEqual(buildDabs(new Date("2026-07-14T10:00:00Z")), {
    date: "2026-07-14",
    status: "ACTIVE",
    bulletinUrl: "https://www.skybriefing.com/de/dabs",
    bulletinPdfUrl: "https://www.skybriefing.com/dabs/dabs.pdf",
    validity: "00:00 - 23:59 LT (2026-07-14)",
    notesDe:
      "Täglich ab 16:00 LT für den Folgetag durch Skybriefing publiziert. Vor jedem Streckenflug obligatorisch zu konsultieren!",
    notesEn:
      "Published daily at 16:00 LT for the next day via Skybriefing. Mandatory consultation prior to cross-country flights!",
  });
});

test("the DABS date is Swiss, not UTC", () => {
  // 23:30 UTC on 14 July is 01:30 on 15 July in Zurich (CEST)
  assert.equal(buildDabs(new Date("2026-07-14T23:30:00Z")).date, "2026-07-15");
  // 23:30 UTC on 14 January is 00:30 on 15 January (CET)
  assert.equal(buildDabs(new Date("2026-01-14T23:30:00Z")).date, "2026-01-15");
});

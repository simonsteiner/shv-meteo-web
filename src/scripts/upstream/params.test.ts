import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTES } from "./routes.ts";

const none = new URLSearchParams();
const quiet = <T>(fn: () => T): T => {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
};

async function status400(result: unknown, error: string) {
  assert.ok(result instanceof Response);
  assert.equal(result.status, 400);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await result.json(), { error });
}

test("a timeseries id is decoded once and passes", () => {
  assert.deepEqual(ROUTES.timeseries.parse({ id: "meteo_swiss%3AKLO" }, none), {
    id: "meteo_swiss:KLO",
  });
  assert.deepEqual(
    ROUTES.timeseries.parse(
      { id: "mistral:dpcn-piemonte:46.30361,8.36639" },
      none,
    ),
    { id: "mistral:dpcn-piemonte:46.30361,8.36639" },
  );
});

test("a timeseries id with a slash or a malformed escape is a 400", async () => {
  for (const id of ["meteo_swiss%3AK%2FLO", "meteo_swiss:a/b", "KLO", "x:"])
    await status400(
      ROUTES.timeseries.parse({ id }, none),
      "Ungültige Stations-ID",
    );
  await status400(
    quiet(() =>
      ROUTES.timeseries.parse({ id: "meteo_swiss%3A%E0%A4%A" }, none),
    ),
    "Ungültige Stations-ID",
  );
});

test("a sounding name with a malformed escape is a 400", async () => {
  await status400(
    quiet(() => ROUTES.sounding.parse({ name: "%E0%A4%A" }, none)),
    "Ungültiger Stationsname",
  );
});

test("a text forecast language with a malformed escape is a 400", async () => {
  await status400(
    quiet(() => ROUTES.textForecast.parse({ lang: "%E0%A4%A" }, none)),
    "Ungültige Sprache",
  );
});

test("the text forecast language falls back to German", () => {
  for (const [lang, want] of [
    ["de", "de"],
    ["fr", "fr"],
    ["IT", "it"],
    ["en", "de"],
    ["xx", "de"],
  ])
    assert.deepEqual(ROUTES.textForecast.parse({ lang }, none), {
      lang: want,
    });
});

test("a query the route doesn't accept is dropped", () => {
  const search = new URLSearchParams("minLat=0&parameters=pressure");
  assert.deepEqual(ROUTES.measurements.parse({}, search), {});
  assert.deepEqual(ROUTES.timeseries.parse({ id: "meteo_swiss:KLO" }, search), {
    id: "meteo_swiss:KLO",
  });
});

test("a sounding name is lower-cased, and one outside the catalogue is a 404", async () => {
  assert.deepEqual(
    ROUTES.sounding.parse({ name: " Disentis%2FMust%C3%A9r " }, none),
    { name: "disentis/mustér" },
  );
  const unknown = ROUTES.sounding.parse({ name: "Atlantis" }, none);
  assert.ok(unknown instanceof Response);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: "Unbekannte Sondierungsstation",
  });
});

test("an unknown or missing foehn pair gets the default pair", () => {
  const pair = (query: string) =>
    ROUTES.foehn.parse({}, new URLSearchParams(query));
  assert.deepEqual(pair("pair=nope"), pair(""));
  assert.deepEqual(pair("pair=GVE_GUT"), { pair: "GVE_GUT" });
});

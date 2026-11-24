import assert from "node:assert/strict";
import { test } from "node:test";
import { readWeatherQuery, withWeatherQuery } from "./query.ts";

test("readWeatherQuery reads a known tab and pair", () => {
  assert.deepEqual(readWeatherQuery("?tab=webcams&pair=GVE_GUT"), {
    tab: "webcams",
    pair: "GVE_GUT",
  });
  assert.deepEqual(readWeatherQuery("?tab=stations"), {
    tab: "stations",
    pair: null,
  });
});

test("readWeatherQuery ignores unknown values", () => {
  assert.deepEqual(readWeatherQuery("?tab=radar&pair=<script>"), {
    tab: null,
    pair: null,
  });
  assert.deepEqual(readWeatherQuery(""), { tab: null, pair: null });
  assert.deepEqual(readWeatherQuery("?pair=klo_lug"), {
    tab: null,
    pair: null,
  });
});

test("withWeatherQuery writes only what differs from the defaults", () => {
  const base = "https://x.test/weather/?lang=fr#top";
  assert.equal(
    withWeatherQuery(base, { tab: "webcams", pair: "PIL_MTR" }, "KLO_LUG"),
    "/weather/?lang=fr&tab=webcams&pair=PIL_MTR#top",
  );
  assert.equal(
    withWeatherQuery(
      "https://x.test/weather/?tab=webcams&pair=PIL_MTR",
      { tab: "stations", pair: "KLO_LUG" },
      "KLO_LUG",
    ),
    "/weather/",
  );
});

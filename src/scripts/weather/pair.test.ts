import assert from "node:assert/strict";
import { test } from "node:test";
import { PAIRS, pairNameKey } from "../foehn/pairs.ts";
import { PAIR_STATUSES } from "../foehn/report.ts";
import { de } from "../i18n/de.ts";
import { lookup } from "../i18n/text.ts";
import {
  alertTextClass,
  bannerClass,
  chartTitleKey,
  formatDelta,
  pairLabel,
  pairStatusText,
  sideKeys,
  stationReading,
} from "./pair.ts";

test("formatDelta signs a positive difference and dashes a missing one", () => {
  assert.equal(formatDelta(4.2), "+4.2");
  assert.equal(formatDelta(-4.7), "-4.7");
  assert.equal(formatDelta(0), "0");
  assert.equal(formatDelta(null), "\u2013");
});

test("the alert level picks the banner and text classes", () => {
  assert.equal(bannerClass("DANGER"), "banner-danger");
  assert.equal(bannerClass("MODERATE"), "banner-warning");
  assert.equal(bannerClass("NONE"), "banner-safe");
  assert.equal(alertTextClass("DANGER"), "text-danger");
  assert.equal(alertTextClass("NONE"), "");
});

test("pairLabel and sideKeys name the pair's two sides", () => {
  assert.equal(pairLabel("KLO_LUG"), "KLO \u2013 LUG");
  assert.deepEqual(sideKeys({ isNorthSouth: true }), {
    first: "weather.sideSouth",
    second: "weather.sideNorth",
  });
  assert.equal(sideKeys({ isNorthSouth: false }).first, "weather.sideEast");
});

test("stationReading shows the pair's unit", () => {
  const st = {
    id: "meteo_swiss:LUG",
    name: "Lugano",
    altitude: 273,
    pressureHpa: 1021.9,
    temperatureC: 9.1,
    coordinates: undefined,
  };
  assert.equal(stationReading({ isPressure: true }, st), "1021.9 hPa");
  assert.equal(stationReading({ isPressure: false }, st), "9.1°C");
  assert.equal(stationReading({ isPressure: true }, undefined), "\u2013 hPa");
});

test("chartTitleKey", () => {
  assert.equal(chartTitleKey("GVE_GUT"), "weather.chart_GVE_GUT");
  assert.equal(chartTitleKey("XYZ"), "weather.chartDefault");
  for (const p of PAIRS)
    assert.equal(chartTitleKey(p.id), `weather.chart_${p.id}`);
});

test("pairStatusText words the status in the UI language, the difference filled in", () => {
  const say = (key: string) =>
    key === "weather.foehnText.STRONG_GRADIENT"
      ? "Fort gradient ({delta} hPa)"
      : `[${key}]`;
  assert.deepEqual(
    pairStatusText({ status: "STRONG_GRADIENT", delta: 6.4 }, say),
    {
      title: "[weather.foehnStatus.STRONG_GRADIENT]",
      text: "Fort gradient (+6.4 hPa)",
    },
  );
  // a code the dictionaries don't know shows as itself
  const stale = { status: "WHATEVER", delta: 1 } as unknown as Parameters<
    typeof pairStatusText
  >[0];
  assert.deepEqual(pairStatusText(stale, say), { title: "WHATEVER", text: "" });
});

test("every pair status and every pair has its words in the dictionary", () => {
  // dictionaries.test.ts checks the other three languages have the same keys
  for (const status of PAIR_STATUSES) {
    assert.ok(lookup(de, `weather.foehnStatus.${status}`), status);
    assert.ok(lookup(de, `weather.foehnText.${status}`), status);
  }
  for (const p of PAIRS) assert.ok(lookup(de, pairNameKey(p.id)), p.id);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertTextClass,
  bannerClass,
  chartTitleKey,
  formatDelta,
  pairDescription,
  pairLabel,
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

test("chartTitleKey and pairDescription", () => {
  assert.equal(chartTitleKey("GVE_GUT"), "weather.chart_GVE_GUT");
  assert.equal(chartTitleKey("XYZ"), "weather.chartDefault");
  const pair = { descriptionDe: "Kein Föhn", descriptionEn: "No foehn" };
  assert.equal(pairDescription(pair, "de"), "Kein Föhn");
  assert.equal(pairDescription(pair, "fr"), "No foehn");
});

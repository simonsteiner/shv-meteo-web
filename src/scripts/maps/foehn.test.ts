import assert from "node:assert/strict";
import { test } from "node:test";
import type { FoehnReport, StationPair } from "../foehn/report.ts";
import {
  alertClass,
  along,
  axisColor,
  foehnAxes,
  formatDelta,
} from "./foehn.ts";

function pair(overrides: Partial<StationPair> = {}): StationPair {
  return {
    id: "KLO_LUG",
    type: "PRESSURE_NORTH_SOUTH",
    isPressure: true,
    isNorthSouth: true,
    midpointPosition: 0.25,
    nameDe: "Gotthard-Achse",
    nameEn: "Gotthard Axis",
    unit: "hPa",
    delta: 4.2,
    status: "MODERATE",
    alertLevel: "MODERATE",
    descriptionDe: "",
    descriptionEn: "",
    station1: {
      id: "meteo_swiss:KLO",
      name: "Zürich / Kloten",
      altitude: 426,
      pressureHpa: 1015.2,
      temperatureC: null,
      coordinates: [8.5, 47.5],
    },
    station2: {
      id: "meteo_swiss:LUG",
      name: "Lugano",
      altitude: 273,
      pressureHpa: null,
      temperatureC: null,
      coordinates: [9, 46],
    },
    ...overrides,
  };
}

const report = (pairs: StationPair[]) => ({ pairs }) as unknown as FoehnReport;

test("alert levels pick the line colour and badge class", () => {
  assert.equal(axisColor("DANGER"), "#EF4444");
  assert.equal(axisColor("MODERATE"), "#F59E0B");
  assert.equal(axisColor("NONE"), "#0089CF");
  assert.equal(alertClass("DANGER"), "badge-danger");
  assert.equal(alertClass("NONE"), "badge-safe");
});

test("formatDelta signs the difference and dashes a missing one", () => {
  assert.equal(formatDelta(4.2, "hPa"), "+4.2 hPa");
  assert.equal(formatDelta(-1, "°C"), "-1 °C");
  assert.equal(formatDelta(0, "hPa"), "0 hPa");
  assert.equal(formatDelta(null, "hPa"), "\u2013");
});

test("along interpolates between two points", () => {
  assert.deepEqual(along([0, 0], [4, 8], 0.25), [1, 2]);
});

test("an axis runs between the stations, its badge a quarter along", () => {
  const [axis] = foehnAxes(report([pair()]), "de");
  assert.deepEqual(axis.from, [47.5, 8.5]);
  assert.deepEqual(axis.to, [46, 9]);
  assert.deepEqual(axis.badgeAt, [47.125, 8.625]);
  assert.ok(axis.badgeHtml.includes("KLO \u2013 LUG"));
  assert.ok(axis.badgeHtml.includes("+4.2 hPa"));
  assert.ok(axis.badgeHtml.includes('title="Gotthard-Achse"'));
  assert.ok(axis.endpointsHtml[0].includes("Zürich / Kloten: 1015.2 hPa"));
  assert.ok(axis.endpointsHtml[0].includes("<span>Zürich</span>"));
  assert.ok(axis.endpointsHtml[1].includes("Lugano: \u2013"));
  assert.ok(
    foehnAxes(report([pair()]), "en")[0].badgeHtml.includes("Gotthard Axis"),
  );
});

test("a pair missing a station position is left out", () => {
  const broken = pair();
  broken.station2 = { ...broken.station2, coordinates: undefined };
  assert.deepEqual(foehnAxes(report([broken]), "de"), []);
  assert.deepEqual(foehnAxes(null, "de"), []);
});

test("station names land in the markers as text", () => {
  const evil = pair();
  evil.station1 = { ...evil.station1, name: "<img src=x onerror=alert(1)>" };
  const [axis] = foehnAxes(report([evil]), "de");
  assert.ok(!axis.endpointsHtml[0].includes("<img"), axis.endpointsHtml[0]);
});

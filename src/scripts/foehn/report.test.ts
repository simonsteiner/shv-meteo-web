import assert from "node:assert/strict";
import { test } from "node:test";
import type { MeasurementFeature } from "../types.ts";
import { pairConfig } from "./pairs.ts";
import {
  assess,
  foehnReport,
  stationPressure,
  stationTemperature,
} from "./report.ts";

function station(
  id: string,
  properties: MeasurementFeature["properties"],
): MeasurementFeature {
  return {
    id: `meteo_swiss:${id}`,
    geometry: { type: "Point", coordinates: [8, 47] },
    properties: { name: id, altitude: 500, ...properties },
  };
}

test("the KLO_LUG thresholds", () => {
  const cfg = pairConfig("KLO_LUG");
  const level = (d: number) => [
    assess(cfg, d).status,
    assess(cfg, d).alertLevel,
  ];
  assert.deepEqual(level(3.9), ["CALM", "NONE"]);
  assert.deepEqual(level(4), ["MODERATE_SOUTH_FOEHN", "MODERATE"]);
  assert.deepEqual(level(8), ["SEVERE_SOUTH_FOEHN", "DANGER"]);
  assert.deepEqual(level(-4), ["MODERATE_NORTH_FOEHN", "MODERATE"]);
  assert.deepEqual(level(-8), ["SEVERE_NORTH_FOEHN", "DANGER"]);
});

test("other pressure pairs grade the absolute gradient", () => {
  const cfg = pairConfig("GVE_GUT");
  assert.equal(assess(cfg, 2.9).alertLevel, "NONE");
  assert.equal(assess(cfg, -3).alertLevel, "MODERATE");
  assert.equal(assess(cfg, 6).alertLevel, "DANGER");
  assert.equal(assess(pairConfig("PIL_MTR"), 10).alertLevel, "NONE");
});

test("a gradient alert has its own status, not CALM", () => {
  const cfg = pairConfig("DEM_GRE");
  assert.equal(assess(cfg, -3).status, "MODERATE_GRADIENT");
  assert.equal(assess(cfg, 6).status, "STRONG_GRADIENT");
  assert.equal(assess(cfg, 2.9).status, "CALM");
});

test("a station's pressure is its QNH, never its QFF or QFE", () => {
  // Kloten's three values on 2026-11-25
  const klo = { pressureMslValue: 1013.2, pressureStandardMslValue: 1011.7 };
  assert.equal(
    stationPressure(station("KLO", { ...klo, pressureSurfaceValue: 961.4 })),
    1011.7,
  );
  assert.equal(
    stationPressure(
      station("KLO", { pressureMslValue: 1013.2, pressureSurfaceValue: 961.4 }),
    ),
    null,
  );
});

test("a pair missing one station's QNH has no difference and no alert", () => {
  const r = foehnReport(
    [
      station("KLO", { pressureMslValue: 1013.2, pressureSurfaceValue: 961.4 }),
      station("LUG", {
        pressureMslValue: 1013.6,
        pressureStandardMslValue: 1012.8,
        pressureSurfaceValue: 977.2,
      }),
    ],
    {},
    "KLO_LUG",
    new Date("2026-11-25T17:00:00Z"),
  );
  assert.equal(r.primaryPair?.diffHpa, null);
  assert.equal(r.primaryPair?.status, "NO_DATA");
  assert.equal(r.primaryPair?.alertLevel, "UNKNOWN");
});

test("no difference is no data, never calm", () => {
  for (const id of ["KLO_LUG", "GVE_GUT", "PIL_MTR"])
    assert.deepEqual(assess(pairConfig(id), null), {
      status: "NO_DATA",
      alertLevel: "UNKNOWN",
    });
});

test("station values accept Kelvin and pascals", () => {
  assert.equal(
    stationTemperature(station("A", { temperature2mValue: 279.65 })),
    6.5,
  );
  assert.equal(stationTemperature(station("A", { temperature2mValue: 0 })), 0);
  assert.equal(
    stationPressure(station("A", { pressureStandardMslValue: 1021.3 })),
    1021.3,
  );
  assert.equal(
    stationPressure(station("A", { pressureStandardMslValue: 102130 })),
    1021.3,
  );
  assert.equal(stationPressure(station("A", {})), null);
});

test("the report has every pair with both stations, and the primary pair", () => {
  const measurements = [
    station("KLO", { pressureStandardMslValue: 1021 }),
    station("LUG", { pressureStandardMslValue: 1013.8 }),
    station("GVE", { pressureStandardMslValue: 1022.1 }),
    station("GUT", { pressureStandardMslValue: 1021.7 }),
    station("PIL", { temperature2mValue: 269.75 }),
    station("MTR", { temperature2mValue: -3.3 }),
    station("DEM", { pressureStandardMslValue: 1021.2 }),
  ];
  const now = new Date("2026-11-23T10:00:00Z");
  const r = foehnReport(measurements, {}, "KLO_LUG", now);
  assert.deepEqual(
    r.pairs.map((p) => [p.id, p.delta]),
    [
      ["KLO_LUG", -7.2],
      ["GVE_GUT", 0.4],
      ["PIL_MTR", -0.1],
    ],
  );
  assert.equal(r.primaryPair?.diffHpa, -7.2);
  assert.equal(r.primaryPair?.alertLevel, "MODERATE");
  assert.equal(r.geoJson.features.length, 6);
  assert.deepEqual(r.history, []);
  assert.equal(r.updatedAt, "2026-11-23T10:00:00.000Z");
});

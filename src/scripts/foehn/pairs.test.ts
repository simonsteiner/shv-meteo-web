import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimeseriesResponse } from "../types.ts";
import { pairConfig, pairDelta, pairHistory, swissTime } from "./pairs.ts";

const KLO_LUG = pairConfig("KLO_LUG");
const GVE_GUT = pairConfig("GVE_GUT");
const PIL_MTR = pairConfig("PIL_MTR");

test("pressure pairs are south minus north, GVE_GUT west minus east", () => {
  // Kloten 1021, Lugano 1014: north higher, a north Foehn difference
  assert.equal(pairDelta(KLO_LUG, 1021, 1014), -7);
  // Geneva 1020, Güttingen 1015: west minus east
  assert.equal(pairDelta(GVE_GUT, 1020, 1015), 5);
  assert.equal(pairDelta(PIL_MTR, -3.4, -3.3), -0.1);
  assert.equal(pairDelta(KLO_LUG, null, 1014), null);
});

test("an unknown pair id gets the Gotthard pair", () => {
  assert.equal(pairConfig("nope").id, "KLO_LUG");
  assert.equal(pairConfig(null).id, "KLO_LUG");
});

test("labels are Swiss time across a DST change", () => {
  // 29 March 2026: clocks go from 02:00 CET to 03:00 CEST at 01:00 UTC
  assert.equal(swissTime(Date.UTC(2026, 2, 29, 0, 30)), "01:30");
  assert.equal(swissTime(Date.UTC(2026, 2, 29, 1, 30)), "03:30");
  assert.equal(swissTime(Date.UTC(2026, 9, 25, 0, 30)), "02:30");
  assert.equal(swissTime(Date.UTC(2026, 9, 25, 1, 30)), "02:30");
});

function ts(
  parameter: string,
  points: [number, number | null][],
): TimeseriesResponse {
  return {
    id: "x",
    timeseries: [
      {
        parameter,
        measurements: points.map(([time, value]) => ({ time, value })),
      },
    ],
  };
}

test("the history pairs matching times within 24 hours", () => {
  const now = new Date(Date.UTC(2026, 6, 14, 12, 0));
  const h = (hours: number) => now.getTime() - hours * 3600_000;
  const north = ts("pressure_msl", [
    [h(25), 1020],
    [h(2), 1021],
    [h(1), 102150],
    [h(0.5), null],
  ]);
  const south = ts("pressure_msl", [
    [h(25), 1010],
    [h(2), 1014],
    [h(1), 1013.5],
    [h(0.5), 1013],
  ]);
  assert.deepEqual(pairHistory(KLO_LUG, north, south, now), [
    { time: "12:00", timestamp: h(2), diffHpa: -7, unit: "hPa" },
    { time: "13:00", timestamp: h(1), diffHpa: -8, unit: "hPa" },
  ]);
});

test("a temperature history converts Kelvin", () => {
  const now = new Date(Date.UTC(2026, 0, 14, 12, 0));
  const t = now.getTime() - 3600_000;
  const pil = ts("temperature", [[t, 270.15]]);
  const mtr = ts("temperature", [[t, -2]]);
  assert.deepEqual(pairHistory(PIL_MTR, pil, mtr, now), [
    { time: "12:00", timestamp: t, diffHpa: -1, unit: "°C" },
  ]);
});

test("a missing or empty series gives an empty history", () => {
  const now = new Date();
  const one = ts("pressure_msl", [[now.getTime(), 1000]]);
  assert.deepEqual(pairHistory(KLO_LUG, null, one, now), []);
  assert.deepEqual(pairHistory(KLO_LUG, one, ts("pressure_msl", []), now), []);
  assert.deepEqual(
    pairHistory(KLO_LUG, one, ts("temperature", [[now.getTime(), 1]]), now),
    [],
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dewPoint,
  parsePointData,
  pointValidTimes,
  soundingLevels,
  valuesAt,
  type SoundingParameter,
} from "./levels.ts";

/** Point data as upstream sends it: one series per level, top first. */
const raw = (levels: number[][], validTimes = [0]) => ({
  validTimes,
  data: {
    levels: levels.map((s) => ({ ensembleMembers: [{ timeSeries: s }] })),
  },
});

test("parsePointData reads levels x time steps, [] for a missing series", () => {
  assert.deepEqual(
    parsePointData(
      raw([
        [1, 2],
        [3, 4],
      ]),
    ),
    [
      [1, 2],
      [3, 4],
    ],
  );
  assert.deepEqual(
    parsePointData({ data: { levels: [{}, { ensembleMembers: [] }] } }),
    [[], []],
  );
  assert.deepEqual(parsePointData(null), []);
  assert.deepEqual(pointValidTimes(raw([], [5, 6])), [5, 6]);
  assert.deepEqual(pointValidTimes({}), []);
});

test("dew point from specific humidity and pressure", () => {
  // 10 g/kg at 1000 hPa: e = 15.98 hPa, so 14.0 °C
  assert.equal(Math.round(dewPoint(0.01, 1000) * 10) / 10, 14);
  // 2 g/kg at 700 hPa: e = 2.25 hPa, so -13.0 °C
  assert.equal(Math.round(dewPoint(0.002, 700) * 10) / 10, -13);
  assert.equal(dewPoint(0, 900), -50);
  assert.equal(dewPoint(0.01, 0), -50);
});

/** Matrices for a column of levels given ground first, stored top first. */
function column(
  rows: {
    t: number;
    p: number;
    h: number;
    q?: number;
    u?: number;
    v?: number;
  }[],
): Record<SoundingParameter, number[][]> {
  const top = [...rows].reverse();
  return {
    temperature: top.map((r) => [r.t]),
    pressure: top.map((r) => [r.p]),
    specific_humidity: top.map((r) => [r.q ?? 0.005]),
    height_half_level: top.map((r) => [r.h]),
    wind_u: top.map((r) => [r.u ?? 0]),
    wind_v: top.map((r) => [r.v ?? 0]),
  };
}

test("levels run ground first and stop at 550 hPa", () => {
  const m = column([
    { t: 283.15, p: 95000, h: 500, v: -10 },
    { t: 278.15, p: 85000, h: 1500, u: -10 },
    { t: 268.15, p: 60000, h: 4000 },
    { t: 258.15, p: 54000, h: 5200 },
    { t: 253.15, p: 50000, h: 5600 },
  ]);
  const levels = soundingLevels(valuesAt(m, 0));
  assert.deepEqual(
    levels.map((l) => [l.heightM, l.pressHpa, l.tempC, l.lapseRate]),
    [
      [500, 950, 10, 0],
      [1500, 850, 5, -0.5],
      [4000, 600, -5, -0.4],
    ],
  );
  // wind from the north (v negative blows south), then from the east
  assert.deepEqual(
    levels.map((l) => [l.speedKmH, l.dirDeg]),
    [
      [36, 0],
      [36, 90],
      [0, 180],
    ],
  );
});

test("no lapse rate when two levels are 10 m or less apart", () => {
  const m = column([
    { t: 283.15, p: 95000, h: 500 },
    { t: 282.15, p: 94900, h: 510 },
    { t: 281.15, p: 94000, h: 600 },
  ]);
  assert.deepEqual(
    soundingLevels(valuesAt(m, 0)).map((l) => l.lapseRate),
    [0, 0, -1.1],
  );
});

test("a missing height_half_level series leaves no level", () => {
  const m = column([
    { t: 283.15, p: 95000, h: 500 },
    { t: 278.15, p: 85000, h: 1500 },
  ]);
  m.height_half_level = [[], []];
  assert.deepEqual(soundingLevels(valuesAt(m, 0)), []);
});

test("a level with a missing or null value is left out, not filled in", () => {
  const m = column([
    { t: 283.15, p: 95000, h: 500 },
    { t: 278.15, p: 85000, h: 1500 },
    { t: 273.15, p: 75000, h: 2500 },
  ]);
  // top first: index 0 is the 750 hPa level, 2 the ground
  m.specific_humidity[1] = [];
  m.temperature[0] = [null as unknown as number];
  const levels = soundingLevels(valuesAt(m, 0));
  assert.deepEqual(
    levels.map((l) => l.heightM),
    [500],
  );
});

test("a one-value height series serves every time step", () => {
  const m = column([{ t: 283.15, p: 95000, h: 500 }]);
  m.temperature = [[283.15, 284.15]];
  m.pressure = [[95000, 95000]];
  m.specific_humidity = [[0.005, 0.005]];
  m.wind_u = [[0, 0]];
  m.wind_v = [[0, 0]];
  assert.equal(soundingLevels(valuesAt(m, 1))[0].heightM, 500);
  assert.equal(soundingLevels(valuesAt(m, 1))[0].tempC, 11);
});

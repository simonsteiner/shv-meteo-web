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
  assert.throws(() => parsePointData(null), /no levels array/);
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

/** Matrices for a column of levels given ground first, stored top first,
 * with `half`, the layers' boundaries from the ground up: one more than
 * the levels, as upstream sends `height_half_level`. */
function column(
  rows: {
    t: number;
    p: number;
    q?: number;
    u?: number;
    v?: number;
  }[],
  half: number[],
): Record<SoundingParameter, number[][]> {
  const top = [...rows].reverse();
  return {
    temperature: top.map((r) => [r.t]),
    pressure: top.map((r) => [r.p]),
    specific_humidity: top.map((r) => [r.q ?? 0.005]),
    height_half_level: [...half].reverse().map((h) => [h]),
    wind_u: top.map((r) => [r.u ?? 0]),
    wind_v: top.map((r) => [r.v ?? 0]),
  };
}

test("levels run ground first and stop at 550 hPa", () => {
  // levels at 500, 1500, 4000, 5700 and 6100 m
  const m = column(
    [
      { t: 283.15, p: 95000, v: -10 },
      { t: 278.15, p: 85000, u: -10 },
      { t: 268.15, p: 60000 },
      { t: 258.15, p: 54000 },
      { t: 253.15, p: 50000 },
    ],
    [400, 600, 2400, 5600, 5800, 6400],
  );
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
  // levels at 500, 510 and 600 m
  const m = column(
    [
      { t: 283.15, p: 95000 },
      { t: 282.15, p: 94900 },
      { t: 281.15, p: 94000 },
    ],
    [495, 505, 515, 685],
  );
  assert.deepEqual(
    soundingLevels(valuesAt(m, 0)).map((l) => l.lapseRate),
    [0, 0, -1.1],
  );
});

test("a missing height_half_level series leaves no level", () => {
  const m = column(
    [
      { t: 283.15, p: 95000 },
      { t: 278.15, p: 85000 },
    ],
    [0, 1000, 2000],
  );
  m.height_half_level = [[], [], []];
  assert.deepEqual(soundingLevels(valuesAt(m, 0)), []);
});

test("a level with a missing or null value is left out, not filled in", () => {
  // levels at 500, 1500 and 2500 m
  const m = column(
    [
      { t: 283.15, p: 95000 },
      { t: 278.15, p: 85000 },
      { t: 273.15, p: 75000 },
    ],
    [0, 1000, 2000, 3000],
  );
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
  const m = column([{ t: 283.15, p: 95000 }], [0, 1000]);
  m.temperature = [[283.15, 284.15]];
  m.pressure = [[95000, 95000]];
  m.specific_humidity = [[0.005, 0.005]];
  m.wind_u = [[0, 0]];
  m.wind_v = [[0, 0]];
  assert.equal(soundingLevels(valuesAt(m, 1))[0].heightM, 500);
  assert.equal(soundingLevels(valuesAt(m, 1))[0].tempC, 11);
});

test("a level's height is the middle of its two half levels", () => {
  // Interlaken (ICON-CH1 point 776549, run 1795608000000, first step): the
  // three lowest of 80 full levels and the four lowest of 81 half levels;
  // the ground is 576 m and the lowest level 586 m, not its top at 596 m
  const m = column(
    [
      { t: 278.3396, p: 94260.14, q: 0.005285641, u: 3.8741684, v: 0.41529 },
      { t: 277.90012, p: 93965.87, q: 0.0052118152, u: 4.698635, v: 0.52698 },
      { t: 277.50427, p: 93563.91, q: 0.0051846877, u: 4.9544106, v: 0.5486 },
    ],
    [576, 596, 627, 666],
  );
  assert.deepEqual(
    soundingLevels(valuesAt(m, 0)).map((l) => l.heightM),
    [586, 612, 647],
  );
});

test("heights that aren't one more than the levels give no level", () => {
  const m = column(
    [
      { t: 283.15, p: 95000 },
      { t: 278.15, p: 85000 },
    ],
    [0, 1000, 2000],
  );
  m.height_half_level = m.height_half_level.slice(1);
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args[0]);
  try {
    assert.deepEqual(soundingLevels(valuesAt(m, 0)), []);
  } finally {
    console.error = original;
  }
  assert.match(
    String(logged[0]),
    /^\[soundingLevels\] 2 half levels for 2 levels/,
  );
});

test("the lapse rate comes from unrounded heights and temperatures", () => {
  // levels at 500.4 and 515.6 m, 10.04 and 9.86 °C: -0.18 °C over 15.2 m is
  // -1.2 °C per 100 m; rounded first (500, 516 m; 10.0, 9.9 °C) it was -0.6
  const m = column(
    [
      { t: 283.19, p: 95000 },
      { t: 283.01, p: 94820 },
    ],
    [490.8, 510, 521.2],
  );
  assert.deepEqual(
    soundingLevels(valuesAt(m, 0)).map((l) => l.lapseRate),
    [0, -1.2],
  );
});

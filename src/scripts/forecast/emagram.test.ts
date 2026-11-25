import assert from "node:assert/strict";
import { test } from "node:test";
import type { SoundingLevel } from "../types.ts";
import {
  altitudeSvg,
  altitudeY,
  closestIndex,
  gridSvg,
  interpolateStep,
  lapseColor,
  PAD_T,
  PLOT_H,
  pToY,
  rulerSvg,
  soundingCurves,
  WIND_LABELS,
} from "./emagram.ts";

const level = (over: Partial<SoundingLevel>): SoundingLevel => ({
  heightM: 500,
  pressHpa: 950,
  tempC: 5,
  dewC: 1,
  speedKmH: 10,
  dirDeg: 270,
  lapseRate: -0.7,
  ...over,
});

test("pToY puts 1000 hPa at the bottom and 600 at the top, clamped", () => {
  assert.equal(pToY(1000), PAD_T + PLOT_H);
  assert.equal(pToY(600), PAD_T);
  assert.equal(pToY(1050), pToY(1000));
  assert.equal(pToY(300), pToY(600));
  assert.ok(pToY(800) < pToY(900));
});

test("lapseColor bands the lapse rate", () => {
  assert.equal(lapseColor(0.2), "#EAB308");
  assert.equal(lapseColor(-0.2), "#84CC16");
  assert.equal(lapseColor(-0.5), "#22C55E");
  assert.equal(lapseColor(-0.7), "#0EA5E9");
  assert.equal(lapseColor(-0.9), "#EF4444");
  assert.equal(lapseColor(-1.2), "#A855F7");
});

test("soundingCurves draws a segment per level pair and a tick every third level", () => {
  const levels = [0, 1, 2, 3, 4].map((i) =>
    level({ pressHpa: 950 - i * 50, heightM: 500 + i * 450 }),
  );
  const c = soundingCurves(levels);
  assert.equal(c.dew.split(" ").length, 5);
  assert.equal(c.wind.split(" ").length, 5);
  assert.equal(c.temp.match(/<line/g)?.length, 4);
  assert.equal(c.barbs.match(/<g /g)?.length, 3);
  assert.deepEqual(soundingCurves([]), {
    dew: "",
    wind: "",
    temp: "",
    barbs: "",
  });
});

test("altitudeY gives no place outside the levels", () => {
  const levels = [level({ heightM: 1950, pressHpa: 800 })];
  assert.equal(altitudeY(4000, levels), null);
  assert.equal(altitudeY(1000, []), null);
});

test("an altitude below the lowest level gets no line, never one above it", () => {
  // model ground at 1080 m: the 1000 m line used to land 25 px above it
  const levels = [
    level({ heightM: 1080, pressHpa: 925 }),
    level({ heightM: 1300, pressHpa: 900 }),
    level({ heightM: 2000, pressHpa: 826 }),
  ];
  assert.equal(altitudeY(1000, levels), null);
  const svg = altitudeSvg(levels);
  assert.ok(!svg.includes(">1000 m<"));
  assert.ok(svg.includes(">2000 m<"));
});

test("interpolateStep blends two steps and turns the wind the short way", () => {
  const steps = [
    { timestamp: 0, levels: [level({ tempC: 0, dirDeg: 350 })] },
    { timestamp: 3600000, levels: [level({ tempC: 10, dirDeg: 10 })] },
  ];
  const mid = interpolateStep(steps, 0.5);
  assert.equal(mid?.timestamp, 1800000);
  assert.equal(mid?.levels[0].tempC, 5);
  assert.equal(mid?.levels[0].dirDeg, 0);
  assert.equal(interpolateStep(steps, 0), steps[0]);
  assert.equal(interpolateStep(steps, 9), steps[1]);
  assert.equal(interpolateStep([], 0), null);
});

test("closestIndex finds the time nearest now", () => {
  assert.equal(closestIndex([0, 100, 200], 140), 1);
  assert.equal(closestIndex([0, 100, 200], 999), 2);
  assert.equal(closestIndex([], 5), 0);
});

test("gridSvg and rulerSvg draw from numbers and escape the label", () => {
  assert.equal(gridSvg().match(/<text/g)?.length, 10);
  const steps = [0, 1, 2].map((h) => ({ timestamp: h * 3600000, levels: [] }));
  const svg = rulerSvg(steps, 3600000, "<now>", (ms) => ms / 3600000);
  assert.ok(svg.includes("00:00"));
  assert.ok(svg.includes("02:00"));
  assert.ok(svg.includes("&lt;now&gt;"));
  assert.equal(
    rulerSvg([], 0, "x", () => 0),
    "",
  );
});

test("the 15, 30 and 45 km/h labels sit where the curve draws those speeds", () => {
  for (const { kmh, x } of WIND_LABELS) {
    const c = soundingCurves([level({ speedKmH: kmh })]);
    assert.equal(c.wind.split(",")[0], x.toFixed(1), `${kmh} km/h`);
  }
  assert.deepEqual(
    WIND_LABELS.map((l) => l.kmh),
    [15, 30, 45],
  );
});

test("levels past the chart's pressure range leave it instead of smearing along its edge", () => {
  const top = soundingCurves([
    level({ pressHpa: 620 }),
    level({ pressHpa: 560 }),
  ]);
  const [, y560] = top.dew.split(" ")[1].split(",").map(Number);
  assert.ok(y560 < PAD_T, `560 hPa at y ${y560}, above the plot`);
  const bottom = soundingCurves([level({ pressHpa: 1021 })]);
  const [, y1021] = bottom.dew.split(",").map(Number);
  assert.ok(y1021 > PAD_T + PLOT_H, `1021 hPa at y ${y1021}, below it`);
  // no direction tick outside the chart
  assert.equal(top.barbs.match(/<g /g)?.length, 1);
});

test("the highest level inside the chart gets a direction tick", () => {
  // every third level, plus the last one inside: 0, 3 and 4, not 5 at 560
  const c = soundingCurves(
    [950, 900, 850, 800, 700, 560].map((pressHpa) => level({ pressHpa })),
  );
  assert.equal(c.barbs.match(/<g /g)?.length, 3);
});

test("altitudeY interpolates between the levels around an altitude", () => {
  const levels = [
    level({ heightM: 1000, pressHpa: 900 }),
    level({ heightM: 2000, pressHpa: 800 }),
  ];
  const y = altitudeY(1500, levels);
  assert.ok(y !== null && y < pToY(900) && y > pToY(800));
  assert.equal(y.toFixed(1), ((pToY(900) + pToY(800)) / 2).toFixed(1));
  // at a level, exactly there
  assert.equal(altitudeY(2000, levels), pToY(800));
});

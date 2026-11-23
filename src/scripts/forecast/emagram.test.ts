import assert from "node:assert/strict";
import { test } from "node:test";
import type { SoundingLevel } from "../types.ts";
import {
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

test("altitudeY uses a level within 150 m, else a linear scale", () => {
  const levels = [level({ heightM: 1950, pressHpa: 800 })];
  assert.equal(altitudeY(2000, levels), pToY(800));
  assert.equal(altitudeY(4000, levels), PAD_T + PLOT_H - 0.8 * PLOT_H);
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

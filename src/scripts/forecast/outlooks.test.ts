import assert from "node:assert/strict";
import { test } from "node:test";
import {
  colorize,
  colorLut,
  outlookFrames,
  PRECIP_PALETTE,
  SUNSHINE_PALETTE,
} from "./outlooks.ts";

test("colorLut makes 0 transparent and 255 the last stop", () => {
  const lut = colorLut(SUNSHINE_PALETTE);
  assert.deepEqual(Array.from(lut.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(lut.slice(255 * 4)), [180, 0, 50, 255]);
  // 50 % lies halfway between the 45 and 55 stops
  const mid = Math.round(0.5 * 255);
  assert.ok(lut[mid * 4 + 3] >= 215 && lut[mid * 4 + 3] <= 225);
});

test("colorize recolours by the green channel", () => {
  const lut = colorLut(PRECIP_PALETTE);
  const pixels = new Uint8ClampedArray([9, 255, 9, 255, 9, 0, 9, 255]);
  colorize(pixels, lut);
  assert.deepEqual(Array.from(pixels), [10, 120, 90, 255, 0, 0, 0, 0]);
});

const frame = (i: number) => ({
  start: `2026-11-23T0${i}:00`,
  end: `2026-11-23T0${i + 1}:00`,
  file: `v1/animation/switzerland/relative_sunshine/run/${i}/animation.webp`,
});

test("outlookFrames prefers the set with 20 or more frames", () => {
  const answer = {
    data: [
      { type: "RELATIVE_SUNSHINE", files: [frame(0)] },
      {
        type: "RELATIVE_SUNSHINE",
        files: Array.from({ length: 23 }, (_, i) => frame(i % 9)),
      },
      { type: "PRECIPITATION_PROBABILITY_WEAK", files: [frame(1)] },
    ],
  };
  const frames = outlookFrames(answer, "RELATIVE_SUNSHINE");
  assert.equal(frames.length, 23);
  assert.equal(
    frames[0].url,
    "https://static-prod.ubmeteo.io/v1/animation/switzerland/relative_sunshine/run/0/animation.webp",
  );
  assert.equal(
    outlookFrames(answer, "PRECIPITATION_PROBABILITY_WEAK").length,
    1,
  );
  assert.deepEqual(
    outlookFrames(answer, "PRECIPITATION_PROBABILITY_STRONG"),
    [],
  );
});

test("outlookFrames skips malformed frames", () => {
  const answer = {
    data: [
      {
        type: "RELATIVE_SUNSHINE",
        files: [
          { ...frame(0), start: undefined },
          { ...frame(1), file: 42 },
          frame(2),
        ],
      },
    ],
  };
  assert.equal(outlookFrames(answer, "RELATIVE_SUNSHINE").length, 1);
  assert.deepEqual(outlookFrames(null, "RELATIVE_SUNSHINE"), []);
});

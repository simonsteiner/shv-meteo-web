import assert from "node:assert/strict";
import { test } from "node:test";
import {
  colorize,
  colorLut,
  intervalLabel,
  legendGradient,
  outlookFrames,
  PRECIP_PALETTE,
  SUNSHINE_PALETTE,
} from "./outlooks.ts";
import { inZone } from "../test-zone.ts";

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

test("intervalLabel gives the day and both times in the locale", () => {
  // the frames' times have no offset, so they parse and print in the same
  // zone and the label is the same whatever TZ the tests run in
  assert.equal(
    intervalLabel(
      { start: "2026-11-23T06:00", end: "2026-11-23T12:00", url: "" },
      "de-CH",
    ),
    "Mo., 23.11. 06:00 \u2013 12:00",
  );
});

test("intervalLabel reads the frames' Zurich times as text in any zone", () => {
  // in Santiago 6 September 2026 has no 00:00: new Date() made it 01:00
  inZone("America/Santiago", () => {
    assert.equal(
      intervalLabel(
        { start: "2026-09-06T00:00", end: "2026-09-06T06:00", url: "" },
        "de-CH",
      ),
      "So., 06.09. 00:00 \u2013 06:00",
    );
  });
});

test("legendGradient follows the palette of the type", () => {
  assert.equal(
    legendGradient("RELATIVE_SUNSHINE"),
    "linear-gradient(to right, #FFF8DB 0%, #FFE270 25%, #FFBE33 45%, #FF6F00 65%, #EB0900 85%, #CC0044 100%)",
  );
  assert.equal(
    legendGradient("PRECIPITATION_PROBABILITY_WEAK"),
    legendGradient("PRECIPITATION_PROBABILITY_STRONG"),
  );
  assert.match(
    legendGradient("PRECIPITATION_PROBABILITY_WEAK"),
    /^linear-gradient\(to right, #C7EDD2 0%/,
  );
});

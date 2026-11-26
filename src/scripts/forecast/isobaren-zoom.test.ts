import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPoint, zoomedWidth } from "./isobaren-zoom.ts";

test("a phone zooms to upstream's width, a wide screen to twice the fit", () => {
  assert.equal(zoomedWidth(340, 1168), 1168);
  assert.equal(zoomedWidth(1110, 1168), 2220);
});

test("zooming in keeps the tapped point under the finger", () => {
  // tapped 100 px into the unscrolled chart, so 100 px into the box too
  const { left, down } = keepPoint({ x: 100, y: 50 }, 2, 100);
  assert.equal(left, 100); // the point is now at 200, shown at 100
  assert.equal(down, 50); // it moved from 50 to 100 below the chart top
});

test("zooming out scrolls back up and never left of the start", () => {
  const { left, down } = keepPoint({ x: 100, y: 200 }, 0.5, 112);
  assert.equal(left, 0);
  assert.equal(down, -100);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { downwindRotation } from "./wind-arrow.ts";

test("an arrow drawn pointing north turns to where the wind blows", () => {
  // a north wind (0°) blows south; a west wind (270°) blows east
  assert.equal(downwindRotation(0), 180);
  assert.equal(downwindRotation(270), 90);
  assert.equal(downwindRotation(200.4), 20);
  assert.equal(downwindRotation(359.6), 180);
});

test("no direction gives no arrow, not a north one", () => {
  assert.equal(downwindRotation(null), null);
  assert.equal(downwindRotation(undefined), null);
  assert.equal(downwindRotation(Number.NaN), null);
});

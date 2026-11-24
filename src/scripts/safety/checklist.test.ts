import assert from "node:assert/strict";
import { test } from "node:test";
import { allChecked, isCheckPoint } from "./checklist.ts";

test("allChecked needs all five points ticked", () => {
  const all = { p1: true, p2: true, p3: true, p4: true, p5: true };
  assert.equal(allChecked(all), true);
  assert.equal(allChecked({ ...all, p3: false }), false);
  assert.equal(allChecked({ p1: true }), false);
  assert.equal(allChecked({ ...all, stale: false }), true);
});

test("isCheckPoint accepts only the five points", () => {
  assert.equal(isCheckPoint("p5"), true);
  assert.equal(isCheckPoint("p6"), false);
  assert.equal(isCheckPoint(null), false);
});

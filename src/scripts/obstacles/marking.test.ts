import assert from "node:assert/strict";
import { test } from "node:test";
import { isMarked, markingLabel } from "./marking.ts";

// BAZL's five values, with their counts on 2026-11-24: NONE 221073,
// MARKED 2010, CABLE_WARNER 1131, ORANGE_MARKS 1037, RED_WHITE_RED 120
test("every marking but NONE or none at all is marked", () => {
  for (const m of ["MARKED", "CABLE_WARNER", "ORANGE_MARKS", "RED_WHITE_RED"])
    assert.equal(isMarked(m), true, m);
  for (const m of ["NONE", "", null, undefined, 3])
    assert.equal(isMarked(m), false, String(m));
});

test("a marking is named by the dictionary, an unknown one by its code", () => {
  const say = (key: string) => `[${key}]`;
  assert.equal(
    markingLabel("CABLE_WARNER", say),
    "[map.sheet.markingName.CABLE_WARNER]",
  );
  assert.equal(markingLabel("STRIPES", say), "STRIPES");
  assert.equal(markingLabel("NONE", say), "[map.sheet.none]");
  assert.equal(markingLabel(undefined, say), "[map.sheet.none]");
});

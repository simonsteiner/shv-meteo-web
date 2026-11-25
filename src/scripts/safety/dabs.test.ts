import assert from "node:assert/strict";
import { test } from "node:test";
import { tomorrowPublished } from "./dabs.ts";

// skybriefing.com/dabs: version 1 for the next day at 16:00 local time
test("tomorrow's DABS counts as out from 16:00 Swiss time", () => {
  // 25 November: CET, UTC+1
  assert.equal(tomorrowPublished(Date.UTC(2026, 10, 25, 14, 59)), false);
  assert.equal(tomorrowPublished(Date.UTC(2026, 10, 25, 15, 0)), true);
  assert.equal(tomorrowPublished(Date.UTC(2026, 10, 25, 22, 59)), true);
  // just after midnight it is a new day: its tomorrow isn't out yet
  assert.equal(tomorrowPublished(Date.UTC(2026, 10, 25, 23, 0)), false);
  // 14 July: CEST, UTC+2
  assert.equal(tomorrowPublished(Date.UTC(2026, 6, 14, 13, 59)), false);
  assert.equal(tomorrowPublished(Date.UTC(2026, 6, 14, 14, 0)), true);
});

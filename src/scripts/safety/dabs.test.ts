import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DABS_FIRST_VERSION,
  DABS_UPDATES,
  nextPublication,
  tomorrowPublished,
} from "./dabs.ts";

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

test("the next publication follows skybriefing's schedule in Swiss time", () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 25, h - 1, m); // CET
  // updates for the day at 09:00, 13:00 and 16:00; version 1 for the
  // next day also at 16:00
  assert.deepEqual(nextPublication(at(7)), {
    time: "09:00",
    nextDay: false,
    tomorrow: false,
  });
  assert.deepEqual(nextPublication(at(9)), {
    time: "13:00",
    nextDay: false,
    tomorrow: false,
  });
  assert.deepEqual(nextPublication(at(12, 59)), {
    time: "13:00",
    nextDay: false,
    tomorrow: false,
  });
  assert.deepEqual(nextPublication(at(13, 30)), {
    time: "16:00",
    nextDay: true,
    tomorrow: false,
  });
  // after 16:00 the next one is tomorrow's first update
  assert.deepEqual(nextPublication(at(16)), {
    time: "09:00",
    nextDay: false,
    tomorrow: true,
  });
  assert.deepEqual(nextPublication(at(23, 30)), {
    time: "09:00",
    nextDay: false,
    tomorrow: true,
  });
});

test("the schedule lists skybriefing's times", () => {
  assert.equal(DABS_FIRST_VERSION, "16:00");
  assert.deepEqual(DABS_UPDATES, ["09:00", "13:00", "16:00"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSwiss, naiveSwiss, swissHour, swissTime } from "./swiss-time.ts";

/** Runs `body` with the process in time zone `tz`, as a visitor abroad. */
export function inZone(tz: string, body: () => void): void {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    body();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

for (const tz of ["UTC", "America/New_York"])
  test(`Swiss times stay Swiss in ${tz}, across the DST change`, () => {
    inZone(tz, () => {
      // 29 March 2026: 02:00 CET becomes 03:00 CEST at 01:00 UTC
      assert.equal(swissTime(Date.UTC(2026, 2, 29, 0, 30)), "01:30");
      assert.equal(swissTime(Date.UTC(2026, 2, 29, 1, 30)), "03:30");
      assert.equal(swissHour(Date.UTC(2026, 2, 29, 1, 30)), 3);
      // 23:30 UTC on 14 January is 00:30 on 15 January in Zurich
      assert.equal(
        formatSwiss(Date.UTC(2026, 0, 14, 23, 30), "de-CH", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        "15.01., 00:30",
      );
    });
  });

test("a naive Zurich time is read as text, whatever the zone", () => {
  // in Santiago 6 September 2026 starts at 01:00: new Date() moved 00:00
  inZone("America/Santiago", () => {
    assert.deepEqual(naiveSwiss("2026-09-06T00:00", "de-CH"), {
      day: "So., 06.09.",
      time: "00:00",
    });
  });
  assert.equal(naiveSwiss("not a time", "de-CH"), null);
});

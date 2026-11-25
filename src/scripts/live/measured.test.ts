import assert from "node:assert/strict";
import { test } from "node:test";
import { isOldMeasurement, measurementTime } from "./measured.ts";

test("a station's time is its wind's, else its temperature's, else its newest", () => {
  assert.equal(
    measurementTime({
      windSpeedTime: 1795625400000,
      temperature2mTime: 1795626000000,
    }),
    1795625400000,
  );
  assert.equal(
    measurementTime({
      temperature2mTime: 1795626000000,
      pressureSurfaceTime: 1795622400000,
    }),
    1795626000000,
  );
  assert.equal(
    measurementTime({ relativeHumidityTime: 1, pressureSurfaceTime: 2 }),
    2,
  );
  assert.equal(measurementTime({ name: "x" }), null);
});

test("a measurement over an hour old is old", () => {
  const t = 1795625400000;
  assert.equal(isOldMeasurement(t, t + 3_600_000), false);
  assert.equal(isOldMeasurement(t, t + 3_600_001), true);
  assert.equal(isOldMeasurement(null, t), false);
});

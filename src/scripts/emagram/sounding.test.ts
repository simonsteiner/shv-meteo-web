import assert from "node:assert/strict";
import { test } from "node:test";
import { BROKEN, COLUMN, pointAnswer } from "./point.fixture.ts";
import { pointProblem, soundingFromForecast } from "./sounding.ts";

test("a complete column has no problem", () => {
  assert.equal(pointProblem(pointAnswer()), null);
});

test("a column whose pressure barely falls with height is a problem", () => {
  assert.match(
    pointProblem(pointAnswer(BROKEN)) ?? "",
    /^pressure falls 0\.1 hPa from the ground to the top at step 0$/,
  );
});

test("a missing series or no time steps is a problem", () => {
  const noWind = Object.fromEntries(
    Object.entries(COLUMN).filter(([name]) => name !== "wind_u"),
  );
  assert.equal(pointProblem(pointAnswer(noWind)), "no wind_u");
  assert.equal(pointProblem({}), "no temperature");
  const point = pointAnswer();
  const temperature = point.parameters!.temperature as { validTimes: number[] };
  temperature.validTimes = [];
  assert.equal(pointProblem(point), "no time steps");
});

test("a series that is there but misshapen throws", () => {
  // the throw is what moves fetchForecast on to the run before
  const point = pointAnswer();
  (point.parameters as Record<string, unknown>).temperature = null;
  assert.throws(() => pointProblem(point), /no levels array/);
});

test("a column without one complete level is a problem", () => {
  // humidity still being written: every value null, so no level has a dew
  // point and the sounding would have nothing to draw
  const noHumidity = {
    ...COLUMN,
    specific_humidity: [null, null, null, null],
  } as unknown as Record<string, number[]>;
  assert.equal(pointProblem(pointAnswer(noHumidity)), "no complete level");
});

test("the browser's sounding keeps the levels up to 550 hPa, ground first", () => {
  const sounding = soundingFromForecast({
    station: {
      name: "Interlaken",
      model: "ICON-CH1",
      elevation: 576.6,
      latitude: 46.68,
      longitude: 7.86,
    },
    run: 1795435200000,
    point: pointAnswer(),
  });
  assert.equal(sounding.run, 1795435200000);
  assert.equal(sounding.elevation, 577);
  assert.deepEqual(sounding.validTimes, [0, 3_600_000]);
  assert.deepEqual(
    sounding.timeSteps[0].levels.map((l) => [l.pressHpa, l.heightM]),
    [
      [950, 1200],
      [850, 2200],
      [700, 3200],
    ],
  );
  // -7 °C over 1000 m from 950 to 850 hPa
  assert.equal(sounding.timeSteps[0].levels[1].lapseRate, -0.7);
});

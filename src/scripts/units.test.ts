import assert from "node:assert/strict";
import { test } from "node:test";
import { round1, toCelsius, toHpa } from "./units.ts";

test("toCelsius takes Kelvin above 200 and Celsius below", () => {
  assert.equal(round1(toCelsius(279.65)!), 6.5);
  assert.equal(toCelsius(12.5), 12.5);
  assert.equal(toCelsius(-3.4), -3.4);
  assert.equal(toCelsius(0), 0);
  assert.equal(toCelsius(null), null);
  assert.equal(toCelsius(Number.NaN), null);
});

test("toHpa takes tenths of hPa above 5000 and hPa below", () => {
  assert.equal(toHpa(10213), 1021.3);
  assert.equal(toHpa(1021.3), 1021.3);
  assert.equal(toHpa(0), 0);
  assert.equal(toHpa(null), null);
});

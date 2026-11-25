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

test("toHpa takes pascals above 20,000 and hPa below", () => {
  // Holfuy and Mistral send pressureSurfaceValue in pascals (Pallanza 98730)
  assert.equal(toHpa(98730), 987.3);
  assert.equal(toHpa(69850), 698.5);
  assert.equal(toHpa(1021.3), 1021.3);
  assert.equal(toHpa(null), null);
});

test("toHpa drops a pressure no station can measure", () => {
  // 82 Mistral stations sent 163820 Pa, Holfuy's Bälmeten (2414 m) 137000
  assert.equal(toHpa(163820), null);
  assert.equal(toHpa(137000), null);
  assert.equal(toHpa(0), null);
  assert.equal(toHpa(299), null);
  assert.equal(toHpa(56760), 567.6);
});

test("toHpa keeps 300 to 1100 hPa, in hPa or in pascals", () => {
  assert.equal(toHpa(300), 300);
  assert.equal(toHpa(1100), 1100);
  assert.equal(toHpa(1101), null);
  assert.equal(toHpa(30000), 300);
  assert.equal(toHpa(110000), 1100);
  assert.equal(toHpa(25000), null);
});

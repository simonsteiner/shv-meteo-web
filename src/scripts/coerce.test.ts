import assert from "node:assert/strict";
import { test } from "node:test";
import { nonZeroNum, num, text } from "./coerce.ts";

test("text keeps strings and gives an empty string for anything else", () => {
  assert.equal(text("Fiesch"), "Fiesch");
  assert.equal(text(""), "");
  assert.equal(text(42), "");
  assert.equal(text(null), "");
  assert.equal(text(undefined), "");
});

test("num keeps finite numbers and gives null for anything else", () => {
  assert.equal(num(12.5), 12.5);
  assert.equal(num(0), 0);
  assert.equal(num(-3), -3);
  assert.equal(num("12"), null);
  assert.equal(num(Number.NaN), null);
  assert.equal(num(Number.POSITIVE_INFINITY), null);
  assert.equal(num(null), null);
});

test("nonZeroNum also takes 0 as missing", () => {
  assert.equal(nonZeroNum(120), 120);
  assert.equal(nonZeroNum(0), null);
  assert.equal(nonZeroNum("120"), null);
  assert.equal(nonZeroNum(Number.NaN), null);
});

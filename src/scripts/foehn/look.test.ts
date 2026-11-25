import assert from "node:assert/strict";
import { test } from "node:test";
import { alertLook, formatDelta, formatDeltaUnit, pairLabel } from "./look.ts";

test("the alert level picks the colour and classes everywhere", () => {
  assert.equal(alertLook("DANGER").color, "#EF4444");
  assert.equal(alertLook("MODERATE").color, "#F59E0B");
  assert.equal(alertLook("NONE").color, "#0089CF");
  assert.equal(alertLook("DANGER").badge, "badge-danger");
  assert.equal(alertLook("MODERATE").banner, "banner-warning");
  assert.equal(alertLook("DANGER").text, "text-danger");
  assert.equal(alertLook("NONE").text, "");
});

test("an unknown alert level looks calm", () => {
  assert.equal(alertLook("SEVERE"), alertLook("NONE"));
  assert.equal(alertLook("toString"), alertLook("NONE"));
});

test("a difference is signed, with its unit, and dashed when missing", () => {
  assert.equal(formatDelta(4.2), "+4.2");
  assert.equal(formatDelta(-4.7), "-4.7");
  assert.equal(formatDelta(0), "0");
  assert.equal(formatDelta(null), "\u2013");
  assert.equal(formatDeltaUnit(4.2, "hPa"), "+4.2 hPa");
  assert.equal(formatDeltaUnit(-1, "°C"), "-1 °C");
  assert.equal(formatDeltaUnit(null, "hPa"), "\u2013");
});

test("pairLabel names the pair's two stations", () => {
  assert.equal(pairLabel("KLO_LUG"), "KLO \u2013 LUG");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRate, gaugeState, varioTone } from "./vario.ts";

test("varioTone beeps in lift, faster and higher as it grows", () => {
  const weak = varioTone(0.5);
  const strong = varioTone(4);
  assert.ok(weak.kind === "beep" && strong.kind === "beep");
  assert.deepEqual(weak, {
    kind: "beep",
    frequency: 760,
    cycleMs: 518,
    beepMs: 180,
  });
  assert.ok(strong.frequency > weak.frequency);
  assert.ok(strong.cycleMs < weak.cycleMs);
});

test("varioTone caps pitch and speed at the slider's top", () => {
  assert.deepEqual(varioTone(6), {
    kind: "beep",
    frequency: 1970,
    cycleMs: 160,
    beepMs: 88,
  });
  const extreme = varioTone(20);
  assert.ok(extreme.kind === "beep");
  assert.equal(extreme.frequency, 2200);
  assert.equal(extreme.cycleMs, 90);
});

test("varioTone is silent in the deadband and drones in strong sink", () => {
  assert.deepEqual(varioTone(0.1), { kind: "silent" });
  assert.deepEqual(varioTone(0), { kind: "silent" });
  assert.deepEqual(varioTone(-1.9), { kind: "silent" });
  assert.deepEqual(varioTone(-2), { kind: "drone", frequency: 270 });
  assert.deepEqual(varioTone(-10), { kind: "drone", frequency: 180 });
});

test("formatRate prints one decimal with a plus sign for lift", () => {
  assert.equal(formatRate(1.2), "+1.2");
  assert.equal(formatRate(0), "0.0");
  assert.equal(formatRate(-2.5), "-2.5");
  assert.equal(formatRate(-0.04), "0.0");
  assert.equal(formatRate(0.04), "0.0");
});

test("gaugeState marks lift above zero and sink below -1.5", () => {
  assert.equal(gaugeState(0.1), "lift");
  assert.equal(gaugeState(0), "level");
  assert.equal(gaugeState(-1.5), "level");
  assert.equal(gaugeState(-1.6), "sink");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { settled, settledInto } from "./settled.ts";

test("a value or a null answer passes through", async () => {
  assert.equal(await settled(Promise.resolve(4), "[x]"), 4);
  assert.equal(await settled(Promise.resolve(null), "[x]"), null);
});

test("a rejection is logged under the label and becomes null", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const err = new Error("offline");
  assert.equal(await settled(Promise.reject(err), "[maps] Cannot load:"), null);
  assert.deepEqual(error.mock.calls[0].arguments, ["[maps] Cannot load:", err]);
});

test("settledInto fails a call that failed or whose use threw", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const seen: string[] = [];
  const use = (v: number) => seen.push(`use ${v}`);
  const onFail = () => seen.push("fail");
  await settledInto(Promise.resolve(1), "[x]", use, onFail);
  await settledInto(Promise.resolve(null), "[x]", use, onFail);
  await settledInto(Promise.reject(new Error("offline")), "[x]", use, onFail);
  const bad = new Error("Invalid GeoJSON object.");
  await settledInto(
    Promise.resolve(2),
    "[maps] Cannot load the airspaces:",
    () => {
      throw bad;
    },
    onFail,
  );
  assert.deepEqual(seen, ["use 1", "fail", "fail", "fail"]);
  assert.deepEqual(error.mock.calls[error.mock.calls.length - 1].arguments, [
    "[maps] Cannot load the airspaces:",
    bad,
  ]);
});

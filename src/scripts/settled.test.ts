import assert from "node:assert/strict";
import { test } from "node:test";
import { settled } from "./settled.ts";

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

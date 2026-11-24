import assert from "node:assert/strict";
import { test } from "node:test";
import { useFallback } from "./dom.ts";

test("a failed image swaps to its fallback once", () => {
  const img = { src: "thumb.jpg", dataset: { fallback: "full.jpg" } };
  assert.equal(useFallback(img), true);
  assert.equal(img.src, "full.jpg");
  assert.equal(useFallback(img), false);
  assert.equal(img.src, "full.jpg");
});

test("an image without a fallback is left to the caller", () => {
  const img = { src: "a.jpg", dataset: {} };
  assert.equal(useFallback(img), false);
  assert.equal(img.src, "a.jpg");
});

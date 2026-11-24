import assert from "node:assert/strict";
import { test } from "node:test";
import { webcamImages } from "./webcams.ts";

test("webcamImages gives no image when neither URL is http(s)", () => {
  assert.deepEqual(
    webcamImages({ identifier: "c", name: "c", latitude: 0, longitude: 0 }),
    { src: null, fallback: null },
  );
});

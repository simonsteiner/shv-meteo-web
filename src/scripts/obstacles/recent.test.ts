import assert from "node:assert/strict";
import { test } from "node:test";
import { keepRecent } from "./recent.ts";

/** A loader that records each key it is asked for. */
function counting(loads: string[]) {
  return async (key: string) => {
    loads.push(key);
    return `cell ${key}`;
  };
}

test("a kept key is served without loading it again", async () => {
  const loads: string[] = [];
  const read = keepRecent(2, counting(loads));
  assert.equal(await read("a"), "cell a");
  assert.equal(await read("a"), "cell a");
  assert.deepEqual(loads, ["a"]);
});

test("past the limit the key read longest ago goes, not the one stored first", async () => {
  const loads: string[] = [];
  const read = keepRecent(2, counting(loads));
  await read("a");
  await read("b");
  // reading a again makes b the oldest
  await read("a");
  await read("c");
  await read("a");
  assert.deepEqual(loads, ["a", "b", "c"]);
  await read("b");
  assert.deepEqual(loads, ["a", "b", "c", "b"]);
});

test("a failed load is not kept", async () => {
  let fail = true;
  const read = keepRecent(2, async (key: string) => {
    if (fail) throw new Error(`${key} answered 503`);
    return key;
  });
  await assert.rejects(read("a"), /503/);
  fail = false;
  assert.equal(await read("a"), "a");
});

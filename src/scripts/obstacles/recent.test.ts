import assert from "node:assert/strict";
import { test } from "node:test";
import { keepRecent, type Sized } from "./recent.ts";

/** A loader that records each key it is asked for; each value weighs
 * `bytes[key]`, else 1. */
function counting(loads: string[], bytes: Record<string, number> = {}) {
  return async (key: string): Promise<Sized<string>> => {
    loads.push(key);
    return { value: `cell ${key}`, bytes: bytes[key] ?? 1 };
  };
}

/** A loader whose loads finish only when the test says, recording the
 * signal each one gets. */
function manual() {
  const pending = new Map<
    string,
    { finish: () => void; signal: AbortSignal }
  >();
  let calls = 0;
  const load = (key: string, signal: AbortSignal) =>
    new Promise<Sized<string>>((resolve, reject) => {
      calls++;
      signal.addEventListener("abort", () => reject(signal.reason));
      pending.set(key, {
        finish: () => resolve({ value: `cell ${key}`, bytes: 1 }),
        signal,
      });
    });
  return { load, pending, calls: () => calls };
}

const nextTask = () => new Promise((r) => setTimeout(r, 5));

test("a kept key is served without loading it again", async () => {
  const loads: string[] = [];
  const read = keepRecent(10, counting(loads));
  assert.equal(await read("a"), "cell a");
  assert.equal(await read("a"), "cell a");
  assert.deepEqual(loads, ["a"]);
});

test("past the budget the key read longest ago goes, not the one stored first", async () => {
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

test("the budget counts bytes: one dense cell pushes out several sparse ones", async () => {
  const loads: string[] = [];
  const read = keepRecent(10, counting(loads, { dense: 8 }));
  for (const key of ["s1", "s2", "s3", "s4"]) await read(key);
  await read("dense");
  // 4 + 8 > 10: the two oldest sparse cells go
  for (const key of ["s3", "s4", "dense"]) await read(key);
  assert.deepEqual(loads, ["s1", "s2", "s3", "s4", "dense"]);
  await read("s1");
  assert.equal(loads[loads.length - 1], "s1");
});

test("a value over the whole budget is still returned, and kept until the next", async () => {
  const loads: string[] = [];
  const read = keepRecent(5, counting(loads, { huge: 9 }));
  assert.equal(await read("huge"), "cell huge");
  await read("huge");
  assert.deepEqual(loads, ["huge"]);
});

test("a failed load is not kept", async () => {
  let fail = true;
  const read = keepRecent(10, async (key: string) => {
    if (fail) throw new Error(`${key} answered 503`);
    return { value: key, bytes: 1 };
  });
  await assert.rejects(read("a"), /503/);
  fail = false;
  assert.equal(await read("a"), "a");
});

test("two views asking for a cell under way share one load", async () => {
  const { load, pending, calls } = manual();
  const read = keepRecent(10, load);
  const first = read("a");
  const second = read("a");
  pending.get("a")!.finish();
  assert.deepEqual(await Promise.all([first, second]), ["cell a", "cell a"]);
  assert.equal(calls(), 1);
});

test("a pan keeps the load the next view also wants, and it is kept", async () => {
  const { load, pending, calls } = manual();
  const read = keepRecent(10, load);
  const left = new AbortController();
  const old = read("a", left.signal);
  // the pan: the old view aborts, the new one asks for the same cell
  left.abort();
  await assert.rejects(old, { name: "AbortError" });
  const next = read("a", new AbortController().signal);
  await nextTask();
  assert.equal(pending.get("a")!.signal.aborted, false);
  pending.get("a")!.finish();
  assert.equal(await next, "cell a");
  assert.equal(await read("a"), "cell a");
  assert.equal(calls(), 1);
});

test("a load no view waits for any more is cancelled and not kept", async () => {
  const { load, pending, calls } = manual();
  const read = keepRecent(10, load);
  const view = new AbortController();
  const got = read("a", view.signal);
  view.abort();
  await assert.rejects(got, { name: "AbortError" });
  await nextTask();
  assert.equal(pending.get("a")!.signal.aborted, true);
  // asked again later: a fresh load
  const again = read("a");
  pending.get("a")!.finish();
  assert.equal(await again, "cell a");
  assert.equal(calls(), 2);
});

test("an already aborted view loads nothing", async () => {
  const { load, calls } = manual();
  const read = keepRecent(10, load);
  const view = new AbortController();
  view.abort();
  await assert.rejects(read("a", view.signal), { name: "AbortError" });
  assert.equal(calls(), 0);
});

test("a view after the cancel starts a load of its own, even before the old one rejects", async () => {
  let calls = 0;
  // the first load reacts to its abort 20 ms late, as a body being read does
  const read = keepRecent(10, (key: string, signal: AbortSignal) => {
    calls++;
    if (calls > 1) return Promise.resolve({ value: `cell ${key}`, bytes: 1 });
    return new Promise<Sized<string>>((_, reject) => {
      signal.addEventListener("abort", () =>
        setTimeout(() => reject(signal.reason), 20),
      );
    });
  });
  const view = new AbortController();
  const got = read("a", view.signal);
  view.abort();
  await assert.rejects(got, { name: "AbortError" });
  await nextTask();
  assert.equal(await read("a", new AbortController().signal), "cell a");
  assert.equal(calls, 2);
  // the old load's late rejection leaves the new value kept
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(await read("a"), "cell a");
  assert.equal(calls, 2);
});

/** Runs `body` with console.error recorded instead of printed. */
async function logged(body: () => Promise<void>): Promise<unknown[][]> {
  const errors: unknown[][] = [];
  const quiet = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await body();
  } finally {
    console.error = quiet;
  }
  return errors;
}

test("a load that fails after every view left is logged, a cancel is not", async () => {
  const fails: Array<() => void> = [];
  const read = keepRecent(
    10,
    (key: string, signal: AbortSignal) =>
      new Promise<Sized<string>>((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
        fails.push(() => reject(new Error(`${key} answered 503`)));
      }),
  );
  const errors = await logged(async () => {
    const left = new AbortController();
    const failed = read("a", left.signal);
    left.abort();
    fails[0]();
    await assert.rejects(failed, { name: "AbortError" });
    const cancelled = new AbortController();
    const gone = read("b", cancelled.signal);
    cancelled.abort();
    await assert.rejects(gone, { name: "AbortError" });
    await nextTask();
  });
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /^\[obstacles\] Cell a failed/);
  assert.match(String(errors[0][1]), /503/);
});

test("a failure a view waits for is left to that view to report", async () => {
  const read = keepRecent(10, async (key: string) => {
    throw new Error(`${key} answered 503`);
  });
  const errors = await logged(async () => {
    await assert.rejects(read("a", new AbortController().signal), /503/);
  });
  assert.equal(errors.length, 0);
});

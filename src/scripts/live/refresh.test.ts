import assert from "node:assert/strict";
import { test } from "node:test";
import { whileVisible } from "./refresh.ts";

/** A page whose visibility the test flips, and a clock and timers the test
 * moves by hand. */
function fakePage(visible = true) {
  let state: DocumentVisibilityState = visible ? "visible" : "hidden";
  let now = 0;
  const listeners: (() => void)[] = [];
  const timers = new Map<
    number,
    { every: number; next: number; run: () => void }
  >();
  let id = 0;
  const deps = {
    doc: {
      get visibilityState() {
        return state;
      },
      addEventListener: (_: "visibilitychange", f: () => void) =>
        void listeners.push(f),
    },
    now: () => now,
    setInterval: (run: () => void, every: number) => {
      timers.set(++id, { every, next: now + every, run });
      return id;
    },
    clearInterval: (t: number) => void timers.delete(t),
  };
  return {
    deps,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.values()]
          .filter((t) => t.next <= end)
          .sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.every;
        due.run();
      }
      now = end;
    },
    show(v: boolean) {
      state = v ? "visible" : "hidden";
      for (const f of listeners) f();
    },
    timers,
  };
}

test("it runs every interval while the page is visible", () => {
  const page = fakePage();
  let runs = 0;
  whileVisible(() => runs++, 90_000, page.deps);
  page.advance(89_999);
  assert.equal(runs, 0);
  page.advance(1);
  assert.equal(runs, 1);
  page.advance(180_000);
  assert.equal(runs, 3);
});

test("a hidden page runs nothing, and catches up at once when shown after a full interval", () => {
  const page = fakePage();
  let runs = 0;
  whileVisible(() => runs++, 90_000, page.deps);
  page.advance(30_000);
  page.show(false);
  assert.equal(page.timers.size, 0);
  page.advance(600_000);
  assert.equal(runs, 0);
  page.show(true);
  assert.equal(runs, 1);
  page.advance(90_000);
  assert.equal(runs, 2);
});

test("shown again within the interval, it waits for the rest of it", () => {
  const page = fakePage();
  let runs = 0;
  whileVisible(() => runs++, 90_000, page.deps);
  page.advance(20_000);
  page.show(false);
  page.advance(10_000);
  page.show(true);
  assert.equal(runs, 0);
  page.advance(90_000);
  assert.equal(runs, 1);
});

test("stop ends it for good", () => {
  const page = fakePage();
  let runs = 0;
  const stop = whileVisible(() => runs++, 90_000, page.deps);
  stop();
  page.show(false);
  page.show(true);
  page.advance(900_000);
  assert.equal(runs, 0);
});

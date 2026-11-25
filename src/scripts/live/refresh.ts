// Runs a refresh every interval while the page is visible: none while it
// is hidden (a background tab costs nothing), and at once on its return
// when a full interval has passed since the last run, else when the rest
// of the interval is up. The measurements' edge TTL is 60 s, so a shorter
// interval would only read the same copy.

export const REFRESH_MS = 90_000;

export interface RefreshDeps {
  doc: {
    readonly visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
  };
  now(): number;
  setInterval(run: () => void, ms: number): number;
  clearInterval(id: number): void;
}

function browser(): RefreshDeps {
  return {
    doc: document,
    now: () => Date.now(),
    setInterval: (run, ms) => window.setInterval(run, ms),
    clearInterval: (id) => window.clearInterval(id),
  };
}

/** Calls `run` every `everyMs` while the page is visible; the answer stops
 * it for good. */
export function whileVisible(
  run: () => void,
  everyMs: number = REFRESH_MS,
  deps: RefreshDeps = browser(),
): () => void {
  let last = deps.now();
  let timer: number | null = null;
  let stopped = false;
  let pending: number | null = null;
  const tick = () => {
    last = deps.now();
    run();
  };
  const halt = () => {
    if (timer !== null) deps.clearInterval(timer);
    if (pending !== null) deps.clearInterval(pending);
    timer = pending = null;
  };
  const start = () => {
    halt();
    const due = last + everyMs - deps.now();
    if (due <= 0) {
      tick();
      timer = deps.setInterval(tick, everyMs);
      return;
    }
    // wait out the rest of the interval once, then run every interval
    pending = deps.setInterval(() => {
      if (pending !== null) deps.clearInterval(pending);
      pending = null;
      tick();
      timer = deps.setInterval(tick, everyMs);
    }, due);
  };
  deps.doc.addEventListener("visibilitychange", () => {
    if (stopped) return;
    if (deps.doc.visibilityState === "visible") start();
    else halt();
  });
  if (deps.doc.visibilityState === "visible") start();
  return () => {
    stopped = true;
    halt();
  };
}

// The obstacle cells read last, kept so panning back costs nothing, and the
// cells still loading, shared by every view that wants them. Pure apart
// from `load`.
//
// The kept cells are capped by their size, not their number: a dense cell
// (Valais, Zurich) is close to 2 MB of JSON and a sparse one a few KB, so a
// count either wastes room or holds far too much.
//
// A pan aborts the view it leaves, but the cells that view was still
// loading are often the next view's too. A load runs on as long as any view
// waits for it, and is cancelled only once none does; a load that finishes
// is kept, whoever asked for it.

/** What `load` gives: the value, and its size for the budget. */
export interface Sized<T> {
  value: T;
  bytes: number;
}

/** A read of `key` that `signal` can stop waiting on. */
export type Read<T> = (key: string, signal?: AbortSignal) => Promise<T>;

function abortError(): DOMException {
  return new DOMException("The view moved on", "AbortError");
}

interface Loading<T> {
  done: Promise<T>;
  controller: AbortController;
  waiting: number;
}

/** `load` behind a cache of up to `maxBytes` of the values read last (a
 * key read again moves to the newest place; the oldest go first) and a
 * table of the loads under way. A failed or cancelled load is not kept. */
export function keepRecent<T>(
  maxBytes: number,
  load: (key: string, signal: AbortSignal) => Promise<Sized<T>>,
): Read<T> {
  const kept = new Map<string, Sized<T>>();
  let keptBytes = 0;
  const loading = new Map<string, Loading<T>>();

  function keep(key: string, entry: Sized<T>): void {
    kept.set(key, entry);
    keptBytes += entry.bytes;
    // a Map iterates in insertion order: the first key is the oldest; the
    // newest stays even when it alone is over the budget
    for (const [old, item] of kept) {
      if (keptBytes <= maxBytes || old === key) break;
      kept.delete(old);
      keptBytes -= item.bytes;
    }
  }

  function start(key: string): Loading<T> {
    const controller = new AbortController();
    const entry: Loading<T> = {
      controller,
      waiting: 0,
      done: load(key, controller.signal).then(
        (sized) => {
          forget(key, entry);
          keep(key, sized);
          return sized.value;
        },
        (err: unknown) => {
          forget(key, entry);
          throw err;
        },
      ),
    };
    // runs before the readers' handlers, so `waiting` still counts the
    // views that will report the failure; with none, it is reported here
    // (a cancel is not a failure)
    entry.done.catch((err: unknown) => {
      if (
        entry.waiting > 0 ||
        (err as { name?: string })?.name === "AbortError"
      )
        return;
      console.error(`[obstacles] Cell ${key} failed, no view waits:`, err);
    });
    loading.set(key, entry);
    return entry;
  }

  /** Drops `entry` from the loads under way, unless a newer load of `key`
   * has taken its place. */
  function forget(key: string, entry: Loading<T>): void {
    if (loading.get(key) === entry) loading.delete(key);
  }

  /** One fewer view waits on `entry`; with none left by the next task (a
   * new view attaches within the same task as the pan), it is cancelled
   * and dropped at once, so a later view starts a load of its own rather
   * than attach to one that is dying. */
  function leave(key: string, entry: Loading<T>): void {
    entry.waiting--;
    if (entry.waiting > 0) return;
    setTimeout(() => {
      if (entry.waiting !== 0) return;
      forget(key, entry);
      entry.controller.abort(abortError());
    }, 0);
  }

  return (key, signal) => {
    const hit = kept.get(key);
    if (hit) {
      kept.delete(key);
      kept.set(key, hit);
      return Promise.resolve(hit.value);
    }
    if (signal?.aborted) return Promise.reject(abortError());
    const entry = loading.get(key) ?? start(key);
    entry.waiting++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        leave(key, entry);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      entry.done.then(
        (value) => {
          if (settled) return;
          settled = true;
          entry.waiting--;
          signal?.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          entry.waiting--;
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  };
}

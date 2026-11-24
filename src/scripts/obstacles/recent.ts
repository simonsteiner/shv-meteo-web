// The obstacle cells read last, kept so panning back costs nothing. Pure
// apart from `load`.

/** `load` behind a cache of the `limit` keys read last: a key read again
 * moves to the newest place, and the one read longest ago goes first. A
 * failed or aborted load is not kept. */
export function keepRecent<T>(
  limit: number,
  load: (key: string, signal?: AbortSignal) => Promise<T>,
): (key: string, signal?: AbortSignal) => Promise<T> {
  const kept = new Map<string, T>();
  return async (key, signal) => {
    if (kept.has(key)) {
      // a Map iterates in insertion order: re-inserting makes it newest
      const value = kept.get(key) as T;
      kept.delete(key);
      kept.set(key, value);
      return value;
    }
    const value = await load(key, signal);
    kept.set(key, value);
    if (kept.size > limit) {
      const oldest = kept.keys().next().value;
      if (oldest !== undefined) kept.delete(oldest);
    }
    return value;
  };
}

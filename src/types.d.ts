// Ambient declarations only; shared shapes live in src/scripts/types.ts.

/** The Workers runtime's edge cache (src/scripts/upstream/respond.ts). */
interface CacheStorage {
  readonly default: Cache;
}

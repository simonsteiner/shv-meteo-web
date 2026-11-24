// The forecast sections' deep links: `/forecast/?cat=gleitschirm`,
// `/forecast/?region=1`, `/forecast/outlooks/?type=...` and
// `/forecast/emagram/?station=Sion`. An unknown value is ignored.

/** The value of `key` in a query string when it is one of `allowed`. */
export function readChoice<T extends string>(
  search: string,
  key: string,
  allowed: readonly T[],
): T | null {
  const v = new URLSearchParams(search).get(key);
  return allowed.includes(v as T) ? (v as T) : null;
}

/** The station a query names, matched by name ignoring case, else null. */
export function readStation<S extends { name: string }>(
  search: string,
  stations: readonly S[],
): S | null {
  const v = new URLSearchParams(search).get("station")?.toLowerCase();
  return v ? (stations.find((s) => s.name.toLowerCase() === v) ?? null) : null;
}

/** `href`'s path, query and hash with each key set, or removed when null. */
export function withParams(
  href: string,
  values: Record<string, string | null>,
): string {
  const url = new URL(href);
  for (const [k, v] of Object.entries(values))
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  return url.pathname + url.search + url.hash;
}

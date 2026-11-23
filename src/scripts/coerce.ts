// Upstream properties arrive untyped; these take a value of the expected
// type out of one, or the empty value when it is anything else.

/** `v` when it is a string, else "". */
export function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** `v` when it is a finite number, else null. */
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** `v` when it is a finite number other than 0, else null: for the
 * upstream fields where 0 stands for a missing value. */
export function nonZeroNum(v: unknown): number | null {
  const n = num(v);
  return n === 0 ? null : n;
}

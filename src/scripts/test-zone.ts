// For tests only: run code as a visitor in another time zone would. Node
// reads `TZ` on every Date call, so setting it takes effect at once.

/** Runs `body` with the process in time zone `tz`, then restores it. */
export function inZone(tz: string, body: () => void): void {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    body();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

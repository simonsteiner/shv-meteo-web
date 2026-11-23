// The five-point pre-flight check; which points are ticked lives in the
// store, per browser tab (src/scripts/settings.ts, `loadChecklist`).

export const CHECK_POINTS = ["p1", "p2", "p3", "p4", "p5"] as const;
export type CheckPoint = (typeof CHECK_POINTS)[number];

export function isCheckPoint(v: unknown): v is CheckPoint {
  return CHECK_POINTS.includes(v as CheckPoint);
}

/** Whether every point is ticked; other keys in the stored map don't count. */
export function allChecked(
  checklist: Readonly<Record<string, boolean>>,
): boolean {
  return CHECK_POINTS.every((p) => checklist[p] === true);
}

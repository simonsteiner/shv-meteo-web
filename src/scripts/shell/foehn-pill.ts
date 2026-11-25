// The header's Foehn pill: the Gotthard pair's current pressure difference
// (src/scripts/foehn/report.ts), coloured by its alert level. Pure, for the
// tests; src/scripts/shell/header.ts puts it on the page.

import { alertLook, formatDeltaUnit, type AlertLook } from "../foehn/look.ts";
import type { FoehnReport } from "../foehn/report.ts";

export interface FoehnPill {
  /** The badge class of the alert level (src/styles/chrome.css). */
  badge: AlertLook["badge"];
  /** "Föhn: +4.2 hPa". */
  label: string;
}

/** The pill for `report`, or null when it has no Gotthard difference: no
 * pill rather than a made-up value. */
export function foehnPill(report: FoehnReport | null): FoehnPill | null {
  const pair = report?.primaryPair;
  if (!pair || typeof pair.diffHpa !== "number") return null;
  const diff = pair.diffHpa;
  return {
    badge: alertLook(pair.alertLevel).badge,
    label: `Föhn: ${formatDeltaUnit(diff, "hPa")}`,
  };
}

// The header's Foehn pill: the Gotthard pair's current pressure difference
// (src/scripts/foehn/report.ts), coloured by its alert level. Pure, for the
// tests; src/scripts/shell/header.ts puts it on the page.

import type { FoehnReport } from "../foehn/report.ts";

export interface FoehnPill {
  /** The badge class of the alert level (src/styles/chrome.css). */
  badge: "badge-safe" | "badge-warning" | "badge-danger";
  /** "Föhn: +4.2 hPa". */
  label: string;
  /** The pair's name, for the title. */
  title: string;
}

const BADGES = {
  NONE: "badge-safe",
  MODERATE: "badge-warning",
  DANGER: "badge-danger",
} as const;

/** The pill for `report`, or null when it has no Gotthard difference: no
 * pill rather than a made-up value. */
export function foehnPill(report: FoehnReport | null): FoehnPill | null {
  const pair = report?.primaryPair;
  if (!pair || typeof pair.diffHpa !== "number") return null;
  const diff = pair.diffHpa;
  return {
    badge: BADGES[pair.alertLevel] ?? "badge-safe",
    label: `Föhn: ${diff > 0 ? "+" : ""}${diff} hPa`,
    title: pair.name,
  };
}

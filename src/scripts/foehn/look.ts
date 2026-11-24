// How a Föhn alert level and a station pair's difference look, the same on
// the map's Foehn layer, the weather page and the header's pill.

import { signed } from "../charts/theme.ts";
import type { StationPair } from "./report.ts";

export type AlertLevel = StationPair["alertLevel"];

export interface AlertLook {
  /** The map's line colour. */
  color: string;
  /** The badge class (src/styles/chrome.css), as on the header's pill. */
  badge: "badge-safe" | "badge-warning" | "badge-danger";
  /** The weather page's banner class. */
  banner: "banner-safe" | "banner-warning" | "banner-danger";
  /** The text class of a pill's value; none when all is calm. */
  text: "" | "text-warning" | "text-danger";
  icon: string;
}

const LOOKS: Record<AlertLevel, AlertLook> = {
  NONE: {
    color: "#0089CF",
    badge: "badge-safe",
    banner: "banner-safe",
    text: "",
    icon: "✅",
  },
  MODERATE: {
    color: "#F59E0B",
    badge: "badge-warning",
    banner: "banner-warning",
    text: "text-warning",
    icon: "⚡",
  },
  DANGER: {
    color: "#EF4444",
    badge: "badge-danger",
    banner: "banner-danger",
    text: "text-danger",
    icon: "⚠️",
  },
};

/** The look of `level`; an unknown level (a stale cache) looks calm. */
export function alertLook(level: string): AlertLook {
  return Object.prototype.hasOwnProperty.call(LOOKS, level)
    ? LOOKS[level as AlertLevel]
    : LOOKS.NONE;
}

/** A difference with a plus sign when positive; a dash when missing. */
export function formatDelta(delta: number | null): string {
  return delta === null ? "\u2013" : signed(delta);
}

/** A difference with its unit, `+3.2 hPa`; a dash alone when missing. */
export function formatDeltaUnit(delta: number | null, unit: string): string {
  return delta === null ? "\u2013" : `${signed(delta)} ${unit}`;
}

/** "KLO \u2013 LUG" for KLO_LUG. */
export function pairLabel(id: string): string {
  return id.replace("_", " \u2013 ");
}

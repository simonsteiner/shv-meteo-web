// How the weather page shows a station pair: the difference with its sign,
// the colour for its alert level, and the words for each side.

import { signed } from "../charts/theme.ts";
import { PAIRS } from "../foehn/pairs.ts";
import type { StationPair, PairStation } from "../foehn/report.ts";

export type Banner = "banner-danger" | "banner-warning" | "banner-safe";

/** A difference with a plus sign when positive; a dash when missing. */
export function formatDelta(delta: number | null): string {
  return delta === null ? "\u2013" : signed(delta);
}

export function bannerClass(level: StationPair["alertLevel"]): Banner {
  if (level === "DANGER") return "banner-danger";
  if (level === "MODERATE") return "banner-warning";
  return "banner-safe";
}

export function alertTextClass(level: StationPair["alertLevel"]): string {
  if (level === "DANGER") return "text-danger";
  if (level === "MODERATE") return "text-warning";
  return "";
}

export function bannerIcon(level: StationPair["alertLevel"]): string {
  if (level === "DANGER") return "⚠️";
  if (level === "MODERATE") return "⚡";
  return "✅";
}

/** "KLO \u2013 LUG" for KLO_LUG. */
export function pairLabel(id: string): string {
  return id.replace("_", " \u2013 ");
}

/** The dictionary keys for the two sides: station2 is shown first, south
 * or east of the pair. */
export function sideKeys(pair: Pick<StationPair, "isNorthSouth">): {
  first: string;
  second: string;
} {
  return pair.isNorthSouth
    ? { first: "weather.sideSouth", second: "weather.sideNorth" }
    : { first: "weather.sideEast", second: "weather.sideWest" };
}

/** A pair station's reading in the pair's unit, e.g. "1021.9 hPa". */
export function stationReading(
  pair: Pick<StationPair, "isPressure">,
  st: PairStation | undefined,
): string {
  const v = pair.isPressure ? st?.pressureHpa : st?.temperatureC;
  const shown = v ?? "\u2013";
  return pair.isPressure ? `${shown} hPa` : `${shown}°C`;
}

/** The dictionary key of a pair's chart title; an unknown pair gets the
 * generic one. */
export function chartTitleKey(id: string): string {
  return PAIRS.some((p) => p.id === id)
    ? `weather.chart_${id}`
    : "weather.chartDefault";
}

/** The pair's description in the UI language; the report
 * (foehn/report.ts) words it in German and English only. */
export function pairDescription(
  pair: Pick<StationPair, "descriptionDe" | "descriptionEn">,
  lang: string,
): string {
  return lang === "de" ? pair.descriptionDe : pair.descriptionEn;
}

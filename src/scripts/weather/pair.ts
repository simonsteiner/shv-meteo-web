// How the weather page words a station pair: each side, each station's
// reading, the chart's title and the status; its colours and the signed
// difference are in foehn/look.ts.

import { formatDelta } from "../foehn/look.ts";
import { PAIRS } from "../foehn/pairs.ts";
import {
  PAIR_STATUSES,
  type PairStation,
  type StationPair,
} from "../foehn/report.ts";
import { fill, type Say } from "../i18n/text.ts";
import { isOneOf } from "../coerce.ts";

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

/** A pair's status headline and description in the UI language, with its
 * difference filled in; the report sends only the status code. A code the
 * dictionaries don't know (a stale edge-cache copy, say) shows as itself,
 * without a description. */
export function pairStatusText(
  pair: Pick<StationPair, "status" | "delta">,
  say: Say,
): { title: string; text: string } {
  const status: string = pair.status;
  if (!isOneOf(PAIR_STATUSES, status)) return { title: status, text: "" };
  return {
    title: say(`weather.foehnStatus.${status}`),
    text: fill(say(`weather.foehnText.${status}`), {
      delta: formatDelta(pair.delta),
    }),
  };
}

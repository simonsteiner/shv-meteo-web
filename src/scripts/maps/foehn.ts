// The Foehn layer: each station pair of the Foehn report as a dashed line
// between its two stations, coloured by alert level, with the stations'
// names at the ends and the difference on a badge along the line.

import { escapeHtml } from "../escape.ts";
import { alertLook, formatDeltaUnit, pairLabel } from "../foehn/look.ts";
import { pairNameKey } from "../foehn/pairs.ts";
import type { FoehnReport, StationPair } from "../foehn/report.ts";
import type { Say } from "../i18n/text.ts";
import type { LatLngTuple } from "./centroid.ts";

const DASH = "\u2013";

export interface FoehnAxis {
  id: string;
  from: LatLngTuple;
  to: LatLngTuple;
  /** Where the badge sits: the pair's `midpointPosition` along the line. */
  badgeAt: LatLngTuple;
  color: string;
  endpointsHtml: [string, string];
  badgeHtml: string;
}

/** The point `t` of the way from `a` to `b`. */
export function along(a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function latLng(c: unknown): LatLngTuple | null {
  if (!Array.isArray(c)) return null;
  const [lng, lat] = c;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lat, lng] : null;
}

function endpointHtml(pair: StationPair, st: StationPair["station1"]): string {
  const name = typeof st.name === "string" ? st.name : st.id;
  const value = pair.isPressure
    ? st.pressureHpa === null
      ? DASH
      : `${st.pressureHpa} hPa`
    : st.temperatureC === null
      ? DASH
      : `${st.temperatureC}°C`;
  return `<div class="pair-endpoint-dot" title="${escapeHtml(`${name}: ${value}`)}"><span>${escapeHtml(name.split(" ")[0])}</span></div>`;
}

/** The axes to draw for `report`: the pairs whose two stations both have a
 * position, each badge titled with the pair's name in the UI language. */
export function foehnAxes(report: FoehnReport | null, say: Say): FoehnAxis[] {
  const out: FoehnAxis[] = [];
  for (const pair of report?.pairs ?? []) {
    const from = latLng(pair.station1?.coordinates);
    const to = latLng(pair.station2?.coordinates);
    if (!from || !to) continue;
    const name = say(pairNameKey(pair.id));
    out.push({
      id: pair.id,
      from,
      to,
      badgeAt: along(from, to, pair.midpointPosition ?? 0.5),
      color: alertLook(pair.alertLevel).color,
      endpointsHtml: [
        endpointHtml(pair, pair.station1),
        endpointHtml(pair, pair.station2),
      ],
      badgeHtml: `<div class="foehn-map-badge ${alertLook(pair.alertLevel).badge}" title="${escapeHtml(name)}"><span class="foehn-badge-id">${escapeHtml(pairLabel(pair.id))}</span><span class="foehn-badge-val">Δ: ${escapeHtml(formatDeltaUnit(pair.delta, pair.unit))}</span></div>`,
    });
  }
  return out;
}

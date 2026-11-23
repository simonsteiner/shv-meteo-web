// The airspaces and wildlife zones on the map: each airspace type's style
// (the official app's style.json) and the popups. Every upstream value in a
// popup is escaped.

import { num, text } from "../coerce.ts";
import { escapeHtml } from "../escape.ts";
import type { Say } from "../i18n/text.ts";

/** Leaflet path options, only those these layers set. */
export interface ZoneStyle {
  color: string;
  weight: number;
  fillColor?: string;
  fillOpacity: number;
  dashArray?: string;
}

const BLUE = "#006092";
const PURPLE = "#6B4099";

/** An airspace's style by its type: controlled zones blue, aerodromes and
 * radio mandatory zones purple, glider sectors green, danger areas orange,
 * restricted areas red. An aerodrome open to hang gliders by agreement is
 * grey and dashed. */
export function airspaceStyle(type: unknown, inactive: unknown): ZoneStyle {
  switch (type) {
    case "CTR":
      return {
        color: BLUE,
        weight: 2,
        dashArray: "6, 3",
        fillColor: BLUE,
        fillOpacity: 0.12,
      };
    case "TMA":
    case "AWY":
    case "CTA":
      return { color: BLUE, weight: 1.5, fillColor: BLUE, fillOpacity: 0.05 };
    case "Airfield":
    case "Heliport":
      return inactive
        ? {
            color: "#4B5563",
            weight: 1.5,
            dashArray: "4, 4",
            fillColor: PURPLE,
            fillOpacity: 0.04,
          }
        : { color: PURPLE, weight: 1.5, fillColor: PURPLE, fillOpacity: 0.12 };
    case "RMZ":
      return {
        color: PURPLE,
        weight: 3,
        dashArray: "4, 2",
        fillColor: PURPLE,
        fillOpacity: 0.08,
      };
    case "FIZ":
      return {
        color: BLUE,
        weight: 2,
        dashArray: "2, 2",
        fillColor: BLUE,
        fillOpacity: 0.05,
      };
    case "W":
      return {
        color: "#00A551",
        weight: 2,
        fillColor: "#00A551",
        fillOpacity: 0.1,
      };
    case "Q":
      return {
        color: "#E58E3D",
        weight: 2,
        fillColor: "#E58E3D",
        fillOpacity: 0.15,
      };
    case "R":
      return {
        color: "#E3000B",
        weight: 2,
        fillColor: "#E3000B",
        fillOpacity: 0.18,
      };
    default:
      return { color: "#3B82F6", weight: 1.5, fillOpacity: 0.08 };
  }
}

export const WILDLIFE_STYLE: ZoneStyle = {
  color: "#10B981",
  weight: 1.5,
  dashArray: "4, 4",
  fillColor: "#10B981",
  fillOpacity: 0.12,
};

/** An altitude with its reference as upstream names it (`m AGL`, `m QNH`,
 * `m STD`): `2320 m QNH`; just the metres when the reference is missing,
 * null when the altitude is. */
export function formatAltitude(alt: unknown, ref: unknown): string | null {
  const m = num(alt);
  if (m === null) return null;
  const reference = typeof ref === "string" ? ref.trim() : "";
  if (!reference) return `${m} m`;
  return /^m\b/.test(reference) ? `${m} ${reference}` : `${m} m ${reference}`;
}

const DASH = "\u2013";

function row(label: string, value: string): string {
  return `<div><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</div>`;
}

/** An airspace's popup: type, name, limits, radio and notes. */
export function airspacePopupHtml(
  p: Record<string, unknown>,
  say: Say,
): string {
  const lower = formatAltitude(p.lowerMetricAltitude, p.lowerMetricReference);
  const upperImperial = num(p.upperImperialAltitude);
  const upper =
    formatAltitude(p.upperMetricAltitude, p.upperMetricReference) ??
    (upperImperial === null ? null : `${upperImperial} ft`);
  const frequency = text(p.frequency);
  const callsign = text(p.callsign);
  const info = text(p.additionalInfo);
  return `<div class="airspace-popup"><span class="popup-badge">${escapeHtml(text(p.type) || say("map.popup.airspace"))}</span><h4 class="popup-title">${escapeHtml(text(p.name) || say("map.popup.airspaceZone"))}</h4><div class="popup-info-grid">${row(say("map.popup.lower"), lower ?? DASH)}${row(say("map.popup.upper"), upper ?? DASH)}${
    frequency ? row(say("map.popup.frequency"), `${frequency} MHz`) : ""
  }${callsign ? row(say("map.popup.callsign"), callsign) : ""}</div>${
    info ? `<p class="popup-desc">${escapeHtml(info)}</p>` : ""
  }${
    p.inactiveByAgreement
      ? `<div class="popup-notice">${escapeHtml(say("map.popup.byAgreement"))}</div>`
      : ""
  }</div>`;
}

/** A wildlife zone's popup: name, minimum altitude and notes. */
export function wildlifePopupHtml(
  p: Record<string, unknown>,
  say: Say,
): string {
  const min = formatAltitude(p.upperAltitude, p.upperReference);
  const info = text(p.additionalInfo);
  return `<div class="airspace-popup wild-popup"><span class="popup-badge badge-wild">${escapeHtml(say("map.popup.wildlife"))}</span><h4 class="popup-title">${escapeHtml(text(p.name) || say("map.popup.wildlifeArea"))}</h4>${
    min
      ? `<div class="popup-info-grid">${row(say("map.popup.minAltitude"), min)}</div>`
      : ""
  }${info ? `<p class="popup-desc">${escapeHtml(info)}</p>` : ""}</div>`;
}

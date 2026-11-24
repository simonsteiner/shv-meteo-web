// A BAZL aviation obstacle's sheet: type, airport, marking and lighting,
// heights, its BAZL id and effective date, and the directions and DABS links.

import { nonZeroNum, text } from "../coerce.ts";
import { escapeHtml } from "../escape.ts";
import { fill, type Say } from "../i18n/text.ts";
import { featureLatLng } from "../maps/centroid.ts";
import { obstacleIconUrl } from "../maps/obstacles.ts";
import type { ObstacleFeature } from "../types.ts";
import {
  ICON,
  coordinatesItem,
  metaItem,
  metric,
  navLink,
  sheetHtml,
} from "./parts.ts";

const TYPES = [
  "TRANSMISSION_LINE",
  "CABLE_CAR",
  "CATENARY",
  "POLE",
  "CRANE",
  "BUILDING",
  "VEGETATION",
  "WINDMILL",
  "STACK",
  "BRIDGE",
];

/** An obstacle type's name, upstream's code when unknown. */
export function obstacleTypeLabel(type: unknown, say: Say): string {
  const t = text(type);
  if (TYPES.includes(t)) return say(`map.sheet.obstacleType.${t}`);
  return t || say("map.sheet.obstacle");
}

function attr(label: string, value: string, cls = ""): string {
  return `<span class="attr-label">${escapeHtml(label)}</span><span${cls ? ` class="${cls}"` : ""}>${escapeHtml(value)}</span>`;
}

/** The record's effective date, or null for a missing or malformed one and
 * for upstream's placeholder `1950-01-01` (on about 2,800 of 225,000). */
function effectiveDate(v: unknown): string | null {
  const d = text(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== "1950-01-01" ? d : null;
}

export function obstacleSheetHtml(f: ObstacleFeature, say: Say): string {
  const p = f.properties ?? {};
  const at = featureLatLng(f);
  const type = text(p.obstacleType);
  const title = obstacleTypeLabel(type, say);
  const isLine =
    p.geometryType === "LineString" ||
    type === "TRANSMISSION_LINE" ||
    type === "CABLE_CAR";
  const icon = obstacleIconUrl(p.styleId, isLine ? "ms_pole" : "red_circle");
  const marked = text(p.marking) !== "" && p.marking !== "NONE";
  const lighting = text(p.lighting);
  const lit = lighting !== "" && lighting !== "NONE";
  const agl = nonZeroNum(p.maxHeightAgl);
  const amsl = nonZeroNum(p.topElevationAmsl);
  const airport = text(p.airport);

  const head = `<div class="sheet-badges-row"><span class="sheet-badge badge-obstacle">${escapeHtml(say("map.sheet.obstacleBadge"))}</span>${
    airport
      ? `<span class="sheet-badge badge-launch">${escapeHtml(fill(say("map.sheet.airport"), { name: airport }))}</span>`
      : ""
  }${marked ? `<span class="sheet-badge badge-status-closed">${escapeHtml(say("map.sheet.marked"))}</span>` : ""}${
    lit
      ? `<span class="sheet-badge badge-status-open">${escapeHtml(say("map.sheet.lit"))}</span>`
      : ""
  }</div><h2 class="sheet-title obstacle-title"><img src="${icon}" alt="" data-hide-on-error /><span>${escapeHtml(title)}</span></h2><div class="sheet-meta">${
    amsl === null
      ? ""
      : metaItem(ICON.mountain, fill(say("map.sheet.amsl"), { m: amsl }))
  }${coordinatesItem(at, say)}</div>`;

  const metrics = [
    agl === null
      ? ""
      : metric(
          say("map.sheet.maxAgl"),
          `${agl} m`,
          say("map.sheet.aboveGround"),
          "metric-agl",
        ),
    amsl === null
      ? ""
      : metric(
          say("map.sheet.maxAmsl"),
          `${amsl} m`,
          say("map.sheet.aboveSea"),
        ),
  ].join("");
  const sourceId = text(p.sourceId);
  const since = effectiveDate(p.effectiveDate);
  const attributes = [
    attr(say("map.sheet.type"), type || "-", "attr-strong"),
    sourceId ? attr(say("map.sheet.bazlId"), sourceId, "attr-mono") : "",
    attr(
      say("map.sheet.marking"),
      p.marking === "MARKED"
        ? say("map.sheet.markedYes")
        : say("map.sheet.none"),
    ),
    attr(
      say("map.sheet.lighting"),
      lit ? `💡 ${lighting}` : say("map.sheet.none"),
    ),
    since ? attr(say("map.sheet.effective"), since) : "",
  ].join("");

  const body = `${metrics ? `<div class="station-metrics-grid obstacle-metrics">${metrics}</div>` : ""}<div class="sheet-section obstacle-attributes"><div class="obstacle-attr-grid">${attributes}</div></div><div class="sheet-actions sheet-actions-spaced">${navLink(at, say)}<a href="https://www.skybriefing.com/de/dabs" target="_blank" rel="noopener" class="btn-action btn-dabs"><span>${escapeHtml(say("map.sheet.dabs"))}</span></a></div>`;
  return sheetHtml({ head, body, label: title }, say);
}

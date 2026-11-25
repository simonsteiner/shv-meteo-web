// A weather station's sheet: provider, name, altitude and position, and
// its latest wind, temperature and pressures (src/scripts/maps/stations.ts
// and pressure.ts do the units).

import { escapeHtml } from "../escape.ts";
import { fill, type Say } from "../i18n/text.ts";
import {
  providerLabel,
  stationLatLng,
  stationMeasurements,
} from "../maps/stations.ts";
import type { MeasurementFeature } from "../types.ts";
import {
  ICON,
  coordinatesItem,
  metaItem,
  metric,
  navLink,
  sheetHtml,
} from "./parts.ts";

export function stationSheetHtml(f: MeasurementFeature, say: Say): string {
  const p = f.properties ?? {};
  const name =
    (typeof p.name === "string" && p.name) || say("map.sheet.station");
  const at = stationLatLng(f);
  const r = stationMeasurements(f);
  const altitude =
    typeof p.altitude === "number" && p.altitude
      ? fill(say("map.sheet.elevation"), { m: p.altitude })
      : say("map.sheet.noElevation");
  const head = `<span class="sheet-badge badge-station">${escapeHtml(providerLabel(f) ?? say("map.sheet.liveStation"))}</span><h2 class="sheet-title">${escapeHtml(name)}</h2><div class="sheet-meta">${metaItem(ICON.mountain, altitude)}${coordinatesItem(at, say)}</div>`;
  const metrics = [
    r.windKmh === null
      ? ""
      : metric(
          say("map.sheet.wind"),
          `${r.windKmh} km/h`,
          r.gustKmh ? fill(say("map.sheet.gusts"), { v: r.gustKmh }) : "",
        ),
    r.tempC === null
      ? ""
      : metric(say("map.sheet.temperature"), `${r.tempC} °C`),
    r.pressure.sea === null
      ? ""
      : metric(
          say(
            r.pressure.sea.kind === "QNH"
              ? "map.sheet.pressure"
              : "map.sheet.pressureQff",
          ),
          `${r.pressure.sea.hpa} hPa`,
        ),
    r.pressure.qfeHpa === null
      ? ""
      : metric(say("map.sheet.pressureQfe"), `${r.pressure.qfeHpa} hPa`),
  ].join("");
  const body = `${
    metrics
      ? `<div class="station-metrics-grid">${metrics}</div>`
      : `<p class="error-notice">${escapeHtml(say("map.sheet.noMeasurements"))}</p>`
  }${at ? `<div class="sheet-actions">${navLink(at, say)}</div>` : ""}`;
  return sheetHtml({ head, body, label: name }, say);
}

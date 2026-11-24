// The live weather layers: stations (wind arrows or temperature pins, only
// those near the view), the Foehn station pairs and the webcams.

import L from "leaflet";
import type { FoehnReport } from "../foehn/report.ts";
import type { Say } from "../i18n/text.ts";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { foehnAxes } from "./foehn.ts";
import { stationLatLng, stationMarker } from "./stations.ts";
import { webcamLatLng, webcamMarkerHtml } from "./webcams.ts";
import { centredIcon, onPick } from "./view.ts";

/** How far beyond the view stations are drawn, as a share of its size. */
const STATION_PAD = 0.35;

export function drawStations(
  layer: L.LayerGroup,
  map: L.Map,
  stations: readonly MeasurementFeature[],
  mode: "WIND" | "TEMPERATURE",
  pick: (f: MeasurementFeature) => void,
): void {
  layer.clearLayers();
  const bounds = map.getBounds().pad(STATION_PAD);
  for (const f of stations) {
    const at = stationLatLng(f);
    if (!at || !bounds.contains(at)) continue;
    const spec = stationMarker(f, mode);
    if (!spec) continue;
    const m = L.marker(at, {
      icon: centredIcon(spec.className, spec.html, spec.size),
    });
    onPick(m, () => pick(f));
    layer.addLayer(m);
  }
}

export function drawFoehn(
  layer: L.LayerGroup,
  report: FoehnReport | null,
  say: Say,
  open: (pairId: string) => void,
): void {
  layer.clearLayers();
  for (const axis of foehnAxes(report, say)) {
    layer.addLayer(
      L.polyline([axis.from, axis.to], {
        color: axis.color,
        weight: 3.5,
        dashArray: "6, 6",
        opacity: 0.85,
      }),
    );
    for (const [i, at] of [axis.from, axis.to].entries())
      layer.addLayer(
        L.marker(at, {
          icon: centredIcon("pair-dot-icon", axis.endpointsHtml[i], [60, 20]),
        }),
      );
    const badge = L.marker(axis.badgeAt, {
      icon: centredIcon("foehn-badge-icon", axis.badgeHtml, [120, 36]),
    });
    onPick(badge, () => open(axis.id));
    layer.addLayer(badge);
  }
}

export function drawWebcams(
  layer: L.LayerGroup,
  webcams: readonly Webcam[],
  pick: (w: Webcam) => void,
): void {
  layer.clearLayers();
  for (const w of webcams) {
    const at = webcamLatLng(w);
    if (!at) continue;
    const m = L.marker(at, {
      icon: centredIcon("webcam-div-icon", webcamMarkerHtml(w), [26, 26]),
    });
    onPick(m, () => pick(w));
    layer.addLayer(m);
  }
}

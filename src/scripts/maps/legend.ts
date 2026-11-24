// The airspace legend in the map's info panel: one entry per style the map
// draws, taken from airspaceStyle() and WILDLIFE_STYLE so the legend can't
// drift from the map. Rendered at build time by
// src/components/map/BottomStack.astro; the words are `map.legend.<key>`.
import { airspaceStyle, WILDLIFE_STYLE, type ZoneStyle } from "./airspace.ts";

export interface LegendEntry {
  key: string;
  style: ZoneStyle;
}

export const AIRSPACE_LEGEND: LegendEntry[] = [
  { key: "ctr", style: airspaceStyle("CTR", false) },
  { key: "tma", style: airspaceStyle("TMA", false) },
  { key: "airfield", style: airspaceStyle("Airfield", false) },
  { key: "airfieldAgreement", style: airspaceStyle("Airfield", true) },
  { key: "rmz", style: airspaceStyle("RMZ", false) },
  { key: "fiz", style: airspaceStyle("FIZ", false) },
  { key: "gliderSector", style: airspaceStyle("W", false) },
  { key: "danger", style: airspaceStyle("Q", false) },
  { key: "restricted", style: airspaceStyle("R", false) },
  { key: "wildlife", style: WILDLIFE_STYLE },
];

/** A small filled rectangle with the style's border, as an inline SVG. */
export function swatchSvg(s: ZoneStyle): string {
  const dash = s.dashArray
    ? ` stroke-dasharray="${s.dashArray.replace(/,\s*/g, " ")}"`
    : "";
  return `<svg class="legend-swatch" width="28" height="16" viewBox="0 0 28 16" aria-hidden="true"><rect x="1.5" y="1.5" width="25" height="13" rx="2" fill="${s.fillColor ?? s.color}" fill-opacity="${s.fillOpacity}" stroke="${s.color}" stroke-width="${s.weight}"${dash}/></svg>`;
}

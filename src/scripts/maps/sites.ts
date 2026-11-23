// The flying sites on the map: which take-offs and landings the search and
// the wind filter leave, the landing circuits, and the markers' HTML. Every
// upstream value in that HTML is escaped.

import { escapeHtml } from "../escape.ts";
import type { Say } from "../i18n/text.ts";
import type { FlyingSiteFeature } from "../types.ts";
import { featureLatLng, type LatLngTuple } from "./centroid.ts";

type Props = FlyingSiteFeature["properties"];

/** The degrees each launch direction points to, clockwise from north. */
const COMPASS_ANGLES: Record<string, number> = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

/** The angle of a launch direction (`SW` is 225), else null. */
export function launchAngle(dir: unknown): number | null {
  return typeof dir === "string" &&
    Object.prototype.hasOwnProperty.call(COMPASS_ANGLES, dir)
    ? COMPASS_ANGLES[dir]
    : null;
}

function kind(p: Props): string {
  return (p.type ?? "").toLowerCase();
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Whether a site's name, rules or club hold `query` (already trimmed and
 * lower-cased); an empty query matches every site. */
export function matchesSearch(p: Props, query: string): boolean {
  if (!query) return true;
  return [p.siteName, p.siteDescription, p.responsible].some((v) =>
    text(v).toLowerCase().includes(query),
  );
}

/** Whether a take-off faces one of the filter's wind directions; no filter
 * suits every take-off. */
export function suitsWind(p: Props, windFilter: readonly string[]): boolean {
  if (windFilter.length === 0) return true;
  const dirs = Array.isArray(p.launchDirections) ? p.launchDirections : [];
  return windFilter.some((d) => dirs.includes(d));
}

export interface PlacedSite {
  feature: FlyingSiteFeature;
  at: LatLngTuple;
}

export interface VisibleSites {
  launches: PlacedSite[];
  landings: PlacedSite[];
}

/** The take-offs and landings to draw: those with a position whose name,
 * rules or club hold the search, and (take-offs only) that face one of the
 * filter's wind directions. */
export function visibleSites(
  features: readonly FlyingSiteFeature[],
  search: string,
  windFilter: readonly string[],
): VisibleSites {
  const query = search.trim().toLowerCase();
  const out: VisibleSites = { launches: [], landings: [] };
  for (const feature of features) {
    const p = feature.properties ?? {};
    const type = kind(p);
    if (type !== "launch" && type !== "landing") continue;
    const at = featureLatLng(feature);
    if (!at || !matchesSearch(p, query)) continue;
    if (type === "launch" && !suitsWind(p, windFilter)) continue;
    (type === "launch" ? out.launches : out.landings).push({ feature, at });
  }
  return out;
}

/** The take-off or landing with `siteId` (a `?site=` link), else null. */
export function findSite(
  features: readonly FlyingSiteFeature[],
  siteId: string,
): FlyingSiteFeature | null {
  return (
    features.find((f) => {
      const type = kind(f.properties ?? {});
      return (
        f.properties?.siteId === siteId &&
        (type === "launch" || type === "landing")
      );
    }) ?? null
  );
}

/** Each site's name by its `siteId`, for the features that lack one. */
export function siteNames(
  features: readonly FlyingSiteFeature[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of features) {
    const { siteId, siteName } = f.properties ?? {};
    if (siteId && siteName) names.set(siteId, siteName);
  }
  return names;
}

export interface LandingCircuit {
  feature: FlyingSiteFeature;
  /** The circuit's vertices, [lat, lng]. */
  path: LatLngTuple[];
  color: string;
  name: string;
  siteName: string;
  /** Where the final leg points, clockwise from north; null when the last
   * two vertices coincide. */
  heading: number | null;
}

const CIRCUIT_COLORS = ["#016191", "#9333EA", "#BE177E"];

/** The colour of a site's `index`th landing circuit. */
export function circuitColor(index: unknown): string {
  const i = typeof index === "number" && index >= 0 ? Math.floor(index) : 0;
  return CIRCUIT_COLORS[i % CIRCUIT_COLORS.length];
}

/** The heading of the last leg of `path`, in degrees clockwise from north,
 * with the longitude scaled to the latitude so the arrow points along the
 * line as drawn. */
export function arrowHeading(path: readonly LatLngTuple[]): number | null {
  if (path.length < 2) return null;
  const [lat2, lng2] = path[path.length - 1];
  const [lat1, lng1] = path[path.length - 2];
  const dy = lat2 - lat1;
  const dx = (lng2 - lng1) * Math.cos((lat2 * Math.PI) / 180);
  if (dx === 0 && dy === 0) return null;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** The landing circuits to draw, with their colour, names and arrow. */
export function landingCircuits(
  features: readonly FlyingSiteFeature[],
  names: ReadonlyMap<string, string>,
  fallbackName: string,
): LandingCircuit[] {
  const out: LandingCircuit[] = [];
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (kind(p) !== "landingpattern") continue;
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords)) continue;
    const path: LatLngTuple[] = [];
    for (const c of coords)
      if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        path.push([c[1], c[0]]);
    if (path.length < 2) continue;
    out.push({
      feature,
      path,
      color: circuitColor(p.featureIndex),
      name: text(p.description) || fallbackName,
      siteName: (p.siteId && names.get(p.siteId)) || "",
      heading: arrowHeading(path),
    });
  }
  return out;
}

/** The arrow at the end of a landing circuit. */
export function circuitArrowHtml(circuit: LandingCircuit): string {
  return `<div class="volte-arrow-pin" style="transform: rotate(${circuit.heading ?? 0}deg);" title="${escapeHtml(circuit.name)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="${circuit.color}" stroke="#0F172A" stroke-width="1.8"><path d="M12 2L21 21L12 17L3 21L12 2Z" /></svg></div>`;
}

/** A landing circuit's popup. */
export function circuitPopupHtml(circuit: LandingCircuit, say: Say): string {
  const site = circuit.siteName
    ? `<p class="popup-desc popup-desc-spaced">${escapeHtml(say("map.popup.landingSite"))} <strong>${escapeHtml(circuit.siteName)}</strong></p>`
    : "";
  return `<div class="airspace-popup volte-popup"><span class="popup-badge popup-badge-volte">${escapeHtml(say("map.popup.landingCircuit"))}</span><h4 class="popup-title">${escapeHtml(circuit.name)}</h4>${site}</div>`;
}

const CLOSED_CROSS = `<line x1="10" y1="10" x2="22" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="22" y1="10" x2="10" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`;
const LAUNCH_PEAK = `<path d="M16 6.5L24.5 21.5H7.5L16 6.5Z" fill="white" stroke="#0F172A" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 11L21 21.5H11L16 11Z" fill="#86EFAC"/>`;
const WINDSOCK = `<line x1="9.5" y1="7" x2="9.5" y2="25" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M9.5 8.5L23.5 11.2V17.8L9.5 20.5V8.5Z" fill="white" stroke="#0F172A" stroke-width="1.2" stroke-linejoin="round"/><path d="M13.8 9.3L13.8 19.7L17.5 19L17.5 10L13.8 9.3Z" fill="#EF4444"/><path d="M20.8 10.7L20.8 18.3L23.5 17.8V11.2L20.8 10.7Z" fill="#EF4444"/>`;
const DIR_ARROW = `<svg width="46" height="46" viewBox="0 0 46 46" fill="none"><path d="M23 1L30 13H16L23 1Z" fill="#FACC15" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M23 3.5L28 11.5H18L23 3.5Z" fill="#FEF08A"/></svg>`;

/** A take-off's (green, with its first launch direction) or a landing's
 * (blue, with a windsock) marker; red with a cross when closed. */
export function siteMarkerHtml(
  feature: FlyingSiteFeature,
  isLaunch: boolean,
  say: Say,
): string {
  const p = feature.properties ?? {};
  const closed = p.openingStatus === "closed";
  const [bg, inner] = closed
    ? ["#DC2626", "#991B1B"]
    : isLaunch
      ? ["#16A34A", "#15803D"]
      : ["#0284C7", "#0369A1"];
  const dir =
    isLaunch && Array.isArray(p.launchDirections)
      ? p.launchDirections[0]
      : null;
  const angle = launchAngle(dir);
  const name =
    text(p.siteName) ||
    say(isLaunch ? "map.sheet.launch" : "map.sheet.landing");
  const title = angle !== null ? `${name} (${dir})` : name;
  const icon = closed ? CLOSED_CROSS : isLaunch ? LAUNCH_PEAK : WINDSOCK;
  return `<div class="shv-site-marker ${isLaunch ? "launch-marker" : "landing-marker"}${closed ? " site-closed" : ""}" title="${escapeHtml(title)}">${
    angle !== null
      ? `<div class="site-marker-dir-arrow" style="transform: rotate(${angle}deg);">${DIR_ARROW}</div>`
      : ""
  }<div class="site-marker-core"><svg width="28" height="28" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="${bg}" stroke="#0F172A" stroke-width="2.2"/><circle cx="16" cy="16" r="11" fill="${inner}"/>${icon}</svg></div>${
    angle !== null
      ? `<span class="site-dir-badge">${escapeHtml(dir)}</span>`
      : ""
  }</div>`;
}

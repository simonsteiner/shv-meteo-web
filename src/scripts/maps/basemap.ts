// The map's base layers, its default view and where a handed-over
// selection puts it (src/scripts/handoff.ts).

import { ZOOM_RANGE } from "../handoff.ts";
import { BASE_MAPS, type BaseMap } from "../settings.ts";
import type { LatLngTuple } from "./centroid.ts";

/** Switzerland's centre (Älggialp), where the map opens. */
export const DEFAULT_CENTER: LatLngTuple = [46.8182, 8.2275];
export const DEFAULT_ZOOM = 9;
export const [MIN_ZOOM, MAX_ZOOM] = ZOOM_RANGE;
/** The least zoom the map shows the pilot's position at. */
export const PILOT_ZOOM = 12;

export interface BaseLayerSpec {
  url: string;
  attribution: string;
  maxZoom: number;
  /** The highest zoom upstream has tiles for; Leaflet scales them up above
   * it. Absent when that is `maxZoom`. */
  maxNativeZoom?: number;
  /** [[south, west], [north, east]]: no tile is asked for outside it. */
  bounds?: [LatLngTuple, LatLngTuple];
}

const LINK = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const SHV = ` · ${LINK("https://www.shv-fsvl.ch", "SHV FSVL")}`;
const SWISSTOPO = (layer: string) =>
  `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.${layer}/default/current/3857/{z}/{x}/{y}.jpeg`;

export const BASE_LAYERS: Record<BaseMap, BaseLayerSpec> = {
  topoLight: {
    url: SWISSTOPO("pixelkarte-grau"),
    attribution: `&copy; ${LINK("https://www.swisstopo.admin.ch", "swisstopo")}${SHV}`,
    maxZoom: 18,
  },
  topoColor: {
    url: SWISSTOPO("pixelkarte-farbe"),
    attribution: `&copy; ${LINK("https://www.swisstopo.admin.ch", "swisstopo")}${SHV}`,
    maxZoom: 18,
  },
  topoSatellite: {
    url: SWISSTOPO("swissimage"),
    attribution: `&copy; ${LINK("https://www.swisstopo.admin.ch", "swisstopo SWISSIMAGE")}${SHV}`,
    maxZoom: 19,
  },
  topoOsm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: `&copy; ${LINK("https://www.openstreetmap.org/copyright", "OpenStreetMap")}${SHV}`,
    maxZoom: 19,
  },
  // BAZL's glider chart (1:350,000, updated yearly): tiles up to z12 in the
  // 3857 grid (z13 answers 400), within the box its WMTS capabilities give;
  // geo.admin.ch's layer config names swisstopo as its attribution
  gliderChart: {
    url: "https://wmts.geo.admin.ch/1.0.0/ch.bazl.segelflugkarte/default/current/3857/{z}/{x}/{y}.png",
    attribution: `&copy; ${LINK("https://www.swisstopo.admin.ch", "swisstopo")} (${LINK("https://www.bazl.admin.ch", "BAZL")})${SHV}`,
    maxZoom: 18,
    maxNativeZoom: 12,
    bounds: [
      [45.398181, 5.140242],
      [48.230651, 11.47757],
    ],
  },
};

/** The preview image of each base map's card in the drawer; OpenStreetMap
 * has none and shows a lettered tile instead. */
export const BASE_MAP_IMAGES: Record<BaseMap, string | null> = {
  topoLight: "/assets/ic_topo_light.png",
  topoColor: "/assets/ic_topo_raster.png",
  topoSatellite: "/assets/ic_topo_imagery.png",
  topoOsm: null,
  gliderChart: "/assets/ic_segelflugkarte.png",
};

/** `key` when it names a base map, else the colour pixel map. */
export function baseMapKey(key: unknown): BaseMap {
  return (BASE_MAPS as readonly unknown[]).includes(key)
    ? (key as BaseMap)
    : "topoColor";
}

/** Where the map goes for a handed-over selection at `at` (null when it
 * has no position) and the asked-for `zoom` (null when none): around the
 * selection, else around the default centre, at `zoom` or the map's
 * current zoom. Null when there is nothing to move. */
export function viewFor(
  at: LatLngTuple | null,
  zoom: number | null,
  currentZoom: number,
): { center: LatLngTuple; zoom: number } | null {
  if (!at && zoom === null) return null;
  return { center: at ?? DEFAULT_CENTER, zoom: zoom ?? currentZoom };
}

/** The zoom the map centres a new pilot position at: the asked-for `zoom`
 * of a ?locate handoff, else the current zoom, but no less than PILOT_ZOOM,
 * so a pilot who zoomed in stays zoomed in. */
export function pilotZoom(zoom: number | null, currentZoom: number): number {
  return zoom ?? Math.max(currentZoom, PILOT_ZOOM);
}

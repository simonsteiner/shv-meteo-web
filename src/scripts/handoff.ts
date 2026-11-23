// The selections a link hands to the map, carried in the map's URL: a
// station (the weather page's "view on map"), a webcam (a webcam card), a
// flying site (`?site=<siteId>`, a take-off or landing) or the pilot's
// location (the header's GPS button off the map, which leaves asking for
// the position to the map, so coordinates never land in the URL or the
// history). Only one is ever set: the page that navigates writes it. `z`
// is the zoom to open at, around the handed-over site or station, else
// around the map's default centre.

export type Handoff =
  | { station: string }
  | { webcam: string }
  | { site: string }
  | { locate: true };

const MAP_PATH = "/map/";

/** Upstream ids are `<provider>:<id>`: `meteo_swiss:KLO`,
 * `mistral:dpcn-piemonte:46.30361,8.36639`, `abufdalp:bielen-startplatz`. */
const ID = /^[\w-]{1,50}:[^\s/]{1,100}$/;

/** A flying site's `siteId`, a UUID in today's data. */
const SITE_ID = /^[\w-]{1,64}$/;

/** The zooms the map allows (src/scripts/maps/basemap.ts). */
export const ZOOM_RANGE = [7, 18] as const;

const PARAMS = ["station", "webcam", "site", "locate", "z"];

/** The map's URL that hands it `h`, e.g. `/map/?station=meteo_swiss%3AKLO`,
 * opening at `zoom` when given. */
export function handoffUrl(h: Handoff | null, zoom?: number): string {
  const params: string[] = [];
  if (h && "locate" in h) params.push("locate");
  else if (h) {
    const [key, value] =
      "station" in h
        ? ["station", h.station]
        : "webcam" in h
          ? ["webcam", h.webcam]
          : ["site", h.site];
    params.push(`${key}=${encodeURIComponent(value)}`);
  }
  if (zoom !== undefined) params.push(`z=${zoom}`);
  return params.length ? `${MAP_PATH}?${params.join("&")}` : MAP_PATH;
}

/** The first valid handoff in a query string (`location.search`), else
 * null. An id that isn't `<provider>:<id>` (or a site id), and any other
 * parameter, is ignored. */
export function readHandoff(search: string): Handoff | null {
  // URLSearchParams never throws: a bad escape decodes to U+FFFD
  for (const [key, value] of new URLSearchParams(search)) {
    if (key === "locate" && value === "") return { locate: true };
    if (key === "station" && ID.test(value)) return { station: value };
    if (key === "webcam" && ID.test(value)) return { webcam: value };
    if (key === "site" && SITE_ID.test(value)) return { site: value };
  }
  return null;
}

/** The zoom `z` asks for: a whole number in ZOOM_RANGE, else null. */
export function readZoom(search: string): number | null {
  const value = new URLSearchParams(search).get("z");
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const zoom = Number(value);
  return zoom >= ZOOM_RANGE[0] && zoom <= ZOOM_RANGE[1] ? zoom : null;
}

/** The handoff parameters (and `z`) taken out of a URL, so a reload
 * doesn't select again; any other parameter and the hash stay. */
export function withoutHandoff(href: string): string {
  const url = new URL(href);
  for (const key of PARAMS) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

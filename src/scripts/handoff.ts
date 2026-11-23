// The selections another page hands to the map, carried in the map's URL:
// a station (the weather page's "view on map"), a webcam (a webcam card) or
// the pilot's location (the header's GPS button off the map, which leaves
// asking for the position to the map, so coordinates never land in the URL
// or the history). Only one is ever set: the page that navigates writes it.

export type Handoff =
  { station: string } | { webcam: string } | { locate: true };

const MAP_PATH = "/map/";

/** Upstream ids are `<provider>:<id>`: `meteo_swiss:KLO`,
 * `mistral:dpcn-piemonte:46.30361,8.36639`, `abufdalp:bielen-startplatz`. */
const ID = /^[\w-]{1,50}:[^\s/]{1,100}$/;

/** The map's URL that hands it `h`, e.g. `/map/?station=meteo_swiss%3AKLO`. */
export function handoffUrl(h: Handoff): string {
  if ("locate" in h) return `${MAP_PATH}?locate`;
  const [key, value] =
    "station" in h ? ["station", h.station] : ["webcam", h.webcam];
  return `${MAP_PATH}?${key}=${encodeURIComponent(value)}`;
}

/** The first valid handoff in a query string (`location.search`), else
 * null. An id that isn't `<provider>:<id>`, and any other parameter, is
 * ignored. */
export function readHandoff(search: string): Handoff | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch (err) {
    console.error("[handoff.readHandoff] Unreadable query:", err);
    return null;
  }
  for (const [key, value] of params) {
    if (key === "locate" && value === "") return { locate: true };
    if (key === "station" && ID.test(value)) return { station: value };
    if (key === "webcam" && ID.test(value)) return { webcam: value };
  }
  return null;
}

/** The handoff parameters taken out of a URL, so a reload doesn't select
 * again; any other parameter and the hash stay. */
export function withoutHandoff(href: string): string {
  const url = new URL(href);
  for (const key of ["station", "webcam", "locate"])
    url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

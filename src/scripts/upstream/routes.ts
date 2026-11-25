// Every proxied route's upstream, cache lifetime, timeout and error body.
// No request picks a host: each upstream URL is a constant here. The
// Functions in functions/api/ are one-line adapters over proxy()
// (respond.ts); the rules live here, each route with its own parameter
// checks (`parse`, over the helpers in params.ts), where the tests run.
import { gridPoint, GRID } from "../emagram/grid.ts";
import { STATION_ID } from "../handoff.ts";
import { pairConfig } from "../foehn/pairs.ts";
import { badRequest, decoded, none, notFound } from "./params.ts";

export interface Route {
  /** The upstream URL for the parsed parameters at `now` (epoch ms); absent
   * for the routes that make several calls (foehn, sounding). The cache key
   * is built from the parameters alone (`serve` in respond.ts), so a URL
   * that moves with the clock still keeps one copy per request. */
  url?(params: Record<string, string>, now: number): string;
  /** Seconds a 200 is fresh: its browser max-age and its edge-cache TTL. */
  ttl: number;
  timeoutMs: number;
  /** The JSON body of the 503 every upstream failure answers. */
  errorBody: object;
  /** The route's parameters from its path and query, or the 400 or 404
   * Response that refuses them before anything goes upstream. It keeps only
   * what the route reads: any other query key is dropped, also from the
   * cache key. */
  parse(
    path: Record<string, string | string[]>,
    search: URLSearchParams,
  ): Record<string, string> | Response;
}

export const WEATHER = "https://weather-ws-prod.ubmeteo.io/v1";

/** Today's default bbox around the Alps (lat 43.5 to 49.5, lon 4 to 16); no
 * caller sends another. */
const ALPS_BBOX = "minLat=43.5&minLon=4.0&maxLat=49.5&maxLon=16.0";

/** The current values the map and the weather page read (maps/stations.ts,
 * weather/stations.ts). Upstream's `temperature`, `relative_humidity` and
 * `dew_point` include their 2 m variants (`temperature2mValue`, ...), while
 * `dew_point_2m` is a 400. A station reporting none of these drops out: on
 * 2026-11-24, 425 of 4,179, none with a value we read (precipitation,
 * pollen, radiation, snow depth). */
const MEASUREMENT_PARAMETERS =
  "wind_speed,wind_direction,wind_gust,temperature,dew_point,relative_humidity,pressure_msl,pressure_standard_msl,pressure_surface";

/** The series the station chart reads; the client sends no `parameters`. */
const TIMESERIES_PARAMETERS =
  "wind_speed,wind_direction,wind_gust,temperature,dew_point,pressure_msl,relative_humidity";

/** How far back the station chart reaches: its "24h" heading. Without
 * `start` upstream sends 14 days (KLO: 548 KB and 2,012 points per series
 * at 10 minutes; a Holfuy station 3 MB at one minute). Exactly 24 hours, so
 * no HH:MM label on the chart's axis appears twice. */
const CHART_SPAN_MS = 24 * 3600 * 1000;

/** `start` is rounded down to the minute. */
const START_STEP_MS = 60 * 1000;

/** The `start` (epoch ms) of a series reaching `spanMs` back from `at`,
 * rounded down to the minute, so every call within a minute asks upstream
 * for the same URL and its cache can answer; a start in milliseconds made
 * each URL new. */
export function startBefore(at: number, spanMs: number): number {
  const since = at - spanMs;
  return since - (since % START_STEP_MS);
}

const TEXT_LANGS = ["de", "fr", "it"];

export type RouteName =
  | "measurements"
  | "timeseries"
  | "webcams"
  | "textForecast"
  | "foehn"
  | "sounding";

export const ROUTES: Record<RouteName, Route> = {
  measurements: {
    url: () =>
      `${WEATHER}/measurements/current?${ALPS_BBOX}&parameters=${MEASUREMENT_PARAMETERS}`,
    ttl: 60,
    timeoutMs: 12_000,
    errorBody: {
      error: "Live-Messwerte vorübergehend nicht erreichbar",
      features: [],
    },
    parse: none,
  },
  timeseries: {
    url: ({ id }, now) =>
      `${WEATHER}/measurements/timeseries/${encodeURIComponent(id)}?parameters=${TIMESERIES_PARAMETERS}&start=${startBefore(now, CHART_SPAN_MS)}`,
    ttl: 180,
    timeoutMs: 8_000,
    errorBody: { error: "Stations-Zeitreihe vorübergehend nicht erreichbar" },
    parse: (path) => {
      const id = decoded(path.id);
      if (id === null || !STATION_ID.test(id))
        return badRequest("Ungültige Stations-ID");
      return { id };
    },
  },
  webcams: {
    url: () =>
      "https://webcam-prod.ubmeteo.io/v1/webcams/overview?west=5.9&south=45.8&east=10.5&north=47.8",
    ttl: 120,
    timeoutMs: 8_000,
    errorBody: {
      error: "Webcams vorübergehend nicht erreichbar",
      webcams: [],
    },
    parse: none,
  },
  textForecast: {
    url: ({ lang }) =>
      `https://shv-app-ws-prod.shv-app.ch/v1/text/forecast/${lang}.json`,
    ttl: 900,
    timeoutMs: 8_000,
    errorBody: { error: "Textprognose vorübergehend nicht erreichbar" },
    parse: (path) => {
      // anything else, the UI's `en` included, gets German, as before; a
      // malformed escape is a 400, as for every other path parameter
      const lang = decoded(path.lang);
      if (lang === null) return badRequest("Ungültige Sprache");
      const lower = lang.toLowerCase();
      return { lang: TEXT_LANGS.includes(lower) ? lower : "de" };
    },
  },
  // keyed by its pair; four calls, described in foehn/fetch.ts
  foehn: {
    ttl: 60,
    timeoutMs: 8_000,
    errorBody: { error: "Föhndaten vorübergehend nicht erreichbar" },
    // an unknown or missing pair gets the Gotthard pair, as before
    parse: (_path, search) => ({ pair: pairConfig(search.get("pair")).id }),
  },
  // keyed by station; its calls are described in emagram/fetch.ts
  sounding: {
    ttl: 1200,
    timeoutMs: 8_000,
    errorBody: { error: "Sondierung vorübergehend nicht erreichbar" },
    parse: (path) => {
      // names may hold `/` (Disentis/Mustér); matched case-insensitively, so
      // the lower-cased name keys the cached copy
      const decodedName = decoded(path.name);
      if (decodedName === null) return badRequest("Ungültiger Stationsname");
      const name = decodedName.trim().toLowerCase();
      return gridPoint(name, GRID)
        ? { name }
        : notFound("Unbekannte Sondierungsstation");
    },
  },
};

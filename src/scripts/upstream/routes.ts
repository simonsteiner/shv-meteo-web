// Every proxied route's upstream, cache lifetime, timeout and error body.
// No request picks a host: each upstream URL is a constant here. The
// Functions in functions/api/ are one-line adapters over proxy()
// (respond.ts); the rules live here and in params.ts, where the tests run.

export interface Route {
  /** The upstream URL for the parsed parameters; absent for the routes that
   * make several calls (foehn, sounding). */
  url?(params: Record<string, string>): string;
  /** Seconds a 200 is fresh: its browser max-age and its edge-cache TTL. */
  ttl: number;
  timeoutMs: number;
  /** The JSON body of the 503 every upstream failure answers. */
  errorBody: object;
  /** The query keys the route accepts; any other is dropped, also from
   * the cache key. */
  query: string[];
}

/** Sent upstream instead of a browser's; never poses as the official app. */
export const USER_AGENT =
  "shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)";

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
  "wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity";

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
    query: [],
  },
  timeseries: {
    url: ({ id }) =>
      `${WEATHER}/measurements/timeseries/${encodeURIComponent(id)}?parameters=${TIMESERIES_PARAMETERS}`,
    ttl: 180,
    timeoutMs: 8_000,
    errorBody: { error: "Stations-Zeitreihe vorübergehend nicht erreichbar" },
    query: [],
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
    query: [],
  },
  textForecast: {
    url: ({ lang }) =>
      `https://shv-app-ws-prod.shv-app.ch/v1/text/forecast/${lang}.json`,
    ttl: 900,
    timeoutMs: 8_000,
    errorBody: { error: "Textprognose vorübergehend nicht erreichbar" },
    query: [],
  },
  // four calls (foehn/fetch.ts): two filtered measurements and the pair's
  // two series, 8 s each; keyed by its pair
  foehn: {
    ttl: 60,
    timeoutMs: 8_000,
    errorBody: { error: "Föhndaten vorübergehend nicht erreichbar" },
    query: ["pair"],
  },
  // the runs list, then one call per run tried (emagram/fetch.ts), 8 s
  // each; keyed by station
  sounding: {
    ttl: 1200,
    timeoutMs: 8_000,
    errorBody: { error: "Sondierung vorübergehend nicht erreichbar" },
    query: [],
  },
};

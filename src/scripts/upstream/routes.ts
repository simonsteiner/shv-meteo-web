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

const WEATHER = "https://weather-ws-prod.ubmeteo.io/v1";

/** Today's default bbox around the Alps (lat 43.5 to 49.5, lon 4 to 16); no
 * caller sends another. */
const ALPS_BBOX = "minLat=43.5&minLon=4.0&maxLat=49.5&maxLon=16.0";

/** The series the station chart reads; the client sends no `parameters`. */
const TIMESERIES_PARAMETERS =
  "wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity";

export type RouteName =
  "measurements" | "timeseries" | "webcams" | "textForecast" | "foehn";

export const ROUTES: Record<RouteName, Route> = {
  measurements: {
    url: () => `${WEATHER}/measurements/current?${ALPS_BBOX}`,
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
  // three calls (foehn/fetch.ts), 8 s each; keyed by its pair
  foehn: {
    ttl: 60,
    timeoutMs: 8_000,
    errorBody: { error: "Föhndaten vorübergehend nicht erreichbar" },
    query: ["pair"],
  },
};

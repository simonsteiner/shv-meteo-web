// ShvApi: the browser's only API client and only caller of fetch. The
// flying sites, airspaces and wildlife reserves come live from the SHV CDN
// (a local copy first under `npm run dev`, gis.ts),
// the outlooks and the isobar chart straight from upstream, and everything
// else goes through the Pages Functions under /api
// (docs/architecture/data-queries.md). A read never rejects: a failed
// one logs and resolves to null (or an empty list), so a view shows its
// empty or error state.
import type {
  Bbox,
  FlyingSiteFeature,
  MeasurementFeature,
  ObstacleFeature,
  Sounding,
  SoundingStation,
  TimeseriesResponse,
  Webcam,
} from "./types.ts";
import type { FoehnReport } from "./foehn/report.ts";
import { DEFAULT_PAIR } from "./foehn/pairs.ts";
import {
  soundingFromForecast,
  type SoundingForecast,
} from "./emagram/sounding.ts";
import { loadObstacles, type ShardIndex } from "./obstacles/cells.ts";
import { keepRecent, type Sized } from "./obstacles/recent.ts";
import { GIS_DATASETS, GIS_DEV_DIR, type GisDataset } from "./gis.ts";

/** The multi-day outlook frames' index; upstream answers with CORS `*`. */
export const OUTLOOKS_URL =
  "https://static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json";

const ISOBAR_LANGS = ["de", "fr", "it"];

/** The isobar chart's SVG for the UI language; there is no English one, so
 * `en` (and anything unknown) gets German. Only ever used as an `<img>`
 * source, which never runs an SVG's scripts. */
export function isobarenUrl(lang: string): string {
  const l = ISOBAR_LANGS.includes(lang) ? lang : "de";
  return `https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/${l}.svg`;
}

export interface FeatureCollection<F = unknown> {
  type: "FeatureCollection";
  features: F[];
}

/** When an /api answer's body came from upstream, and whether it is the
 * edge's stand-in for a failed upstream call (respond.ts sends both as
 * `x-fetched-at` and `x-cache`). */
export interface Freshness {
  /** ms since the epoch. */
  fetchedAt: number;
  stale: boolean;
}

/** Each answer's freshness, keyed by the parsed answer itself, so the
 * answers keep their types. */
const freshness = new WeakMap<object, Freshness>();

function noteFreshness(answer: unknown, resp: Response): void {
  const fetchedAt = Number(resp.headers.get("x-fetched-at"));
  if (typeof answer !== "object" || answer === null || !(fetchedAt > 0)) return;
  freshness.set(answer, {
    fetchedAt,
    stale: resp.headers.get("x-cache") === "stale",
  });
}

/** The JSON at `url`, or null after logging why not. */
async function getJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const answer = (await resp.json()) as T;
      noteFreshness(answer, resp);
      return answer;
    }
    console.error(
      `[ShvApi.${label}] HTTP error:`,
      resp.status,
      resp.statusText,
    );
  } catch (e) {
    console.error(`[ShvApi.${label}] Network error:`, e);
  }
  return null;
}

/** `load` memoised per key: callers share one request, and a null answer
 * is forgotten so the next call asks again; `fresh` asks again anyway, and
 * later calls share that answer. */
function retryable<T>(
  load: (key: string) => Promise<T | null>,
): (key?: string, fresh?: boolean) => Promise<T | null> {
  const kept = new Map<string, Promise<T | null>>();
  return (key = "", fresh = false) => {
    if (fresh) kept.delete(key);
    let pending = kept.get(key);
    if (!pending) {
      const asked: Promise<T | null> = load(key).then((answer) => {
        // a later fresh call may have replaced this one: forget only our own
        if (answer === null && kept.get(key) === asked) kept.delete(key);
        return answer;
      });
      pending = asked;
      kept.set(key, pending);
    }
    return pending;
  };
}

/** Whether this is `npm run dev`; a built page and Node's tests aren't. */
const DEV = import.meta.env?.DEV === true;

/** A GIS dataset: with `dev`, the local copy `npm run gis` wrote, when
 * there is one; otherwise, or without one, the SHV CDN. Null (logged) when
 * the CDN read fails. */
export async function readGis<T>(
  { url, file }: GisDataset,
  label: string,
  dev: boolean,
): Promise<T | null> {
  if (dev) {
    try {
      const resp = await fetch(`${GIS_DEV_DIR}/${file}`);
      if (resp.ok) return (await resp.json()) as T;
      console.warn(
        `[ShvApi.${label}] No local copy (npm run gis), reading the CDN:`,
        resp.status,
      );
    } catch (e) {
      console.warn(
        `[ShvApi.${label}] Local copy unreadable, reading the CDN:`,
        e,
      );
    }
  }
  return getJson<T>(url, label);
}

/** A GIS dataset, read once per page load and asked again after a failure. */
function live<T>(dataset: GisDataset, label: string): () => Promise<T | null> {
  const memo = retryable<T>(() => readGis<T>(dataset, label, DEV));
  return () => memo();
}

/** The GIS datasets' CDN URLs; with OUTLOOKS_URL, all the browser reads
 * without /api (the CSP's connect-src, access/csp.ts, allows their
 * origins). Never committed as copies: a copy goes stale (closures, new
 * airspaces); the site sheet links the official map for the reference
 * (OFFICIAL_MAP_URL, sheet/site.ts). */
export const GIS_URLS = Object.values(GIS_DATASETS).map((d) => d.url);

/** A view's obstacles; `incomplete` when some cells couldn't be read and
 * the rest are drawn. */
export interface ObstacleAnswer {
  features: ObstacleFeature[];
  incomplete: boolean;
}

// One request per page load: the header's Foehn badge and the view on the
// same page share a call. The measurements are asked again every 90 s
// while the page is visible (live/refresh.ts).
const measurements = retryable<FeatureCollection<MeasurementFeature>>(() =>
  getJson("/api/measurements", "getMeasurements"),
);
// Keyed by pair, so the pair switcher gets its own.
const foehn = retryable<FoehnReport>((pair) =>
  getJson(`/api/foehn?pair=${encodeURIComponent(pair)}`, "getFoehn"),
);

// The obstacle shards (obstacles/cells.ts): the index once per page load,
// and the last cells read, so panning back costs nothing.
const OBSTACLES = "/data/obstacles";
/** The JSON the kept cells may hold, in characters: about a view and a half
 * of the densest area (Valais at z10 reads 22 MB), against up to 120 MB
 * when 64 cells of any size were kept. */
const OBSTACLE_CACHE_BYTES = 32_000_000;
const obstacleIndex = retryable<ShardIndex>(() =>
  getJson(`${OBSTACLES}/index.json`, "getObstacles"),
);

async function fetchObstacleShard(
  path: string,
  signal?: AbortSignal,
): Promise<Sized<unknown>> {
  const resp = await fetch(`${OBSTACLES}/${path}`, { signal });
  if (!resp.ok) throw new Error(`${path} answered ${resp.status}`);
  const text = await resp.text();
  return { value: JSON.parse(text) as unknown, bytes: text.length };
}

const fetchObstacleCell = keepRecent(OBSTACLE_CACHE_BYTES, fetchObstacleShard);

export const ShvApi = {
  getFlyingSites: live<FeatureCollection<FlyingSiteFeature>>(
    GIS_DATASETS.flyingSites,
    "getFlyingSites",
  ),
  getAirspaces: live<GeoJSON.FeatureCollection>(
    GIS_DATASETS.airspaces,
    "getAirspaces",
  ),
  getWildschutz: live<GeoJSON.FeatureCollection>(
    GIS_DATASETS.wildschutz,
    "getWildschutz",
  ),

  /** The obstacles a map view shows, `incomplete` when some of its cells
   * couldn't be read (the rest still come); null when its index couldn't
   * be read, and, without a log, when `signal` aborted. */
  async getObstacles(
    { zoom, ...bbox }: Bbox & { zoom: number },
    options: { signal?: AbortSignal } = {},
  ): Promise<ObstacleAnswer | null> {
    const index = await obstacleIndex();
    if (!index) return null;
    try {
      const { features, failed } = await loadObstacles(
        bbox,
        zoom,
        index,
        fetchObstacleCell,
        options.signal,
      );
      return { features, incomplete: failed };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return null;
      console.error("[ShvApi.getObstacles] Failed to load obstacles:", err);
      return null;
    }
  },

  /** When `answer`, a value another read resolved to, was fetched and
   * whether it is a stale stand-in; null for one without that (a static
   * file, an upstream read directly, null) and for a read that builds a new
   * object from its answer (`getEmagramForecast`'s sounding). */
  freshness(answer: unknown): Freshness | null {
    return typeof answer === "object" && answer !== null
      ? (freshness.get(answer) ?? null)
      : null;
  },

  /** The current measurements, shared by every caller on the page; `fresh`
   * asks /api again (the pages' live refresh, live/refresh.ts). */
  getMeasurements({
    fresh = false,
  }: {
    fresh?: boolean;
  } = {}): Promise<FeatureCollection<MeasurementFeature> | null> {
    return measurements("", fresh);
  },

  getWebcams(): Promise<{ webcams: Webcam[] } | null> {
    return getJson("/api/webcams", "getWebcams");
  },

  /** The Foehn report with `pairId`'s history. */
  getFoehn(pairId: string = DEFAULT_PAIR): Promise<FoehnReport | null> {
    return foehn(pairId);
  },

  getTextForecast(lang = "de"): Promise<unknown> {
    return getJson(
      `/api/meteo/text-forecast/${encodeURIComponent(lang)}`,
      "getTextForecast",
    );
  },

  getIsobarenSvgUrl(lang = "de"): string {
    return isobarenUrl(lang);
  },

  async getStationTimeseries(
    stationId: string | null | undefined,
  ): Promise<TimeseriesResponse | null> {
    if (!stationId) return null;
    return getJson(
      `/api/measurements/timeseries/${encodeURIComponent(stationId)}`,
      "getStationTimeseries",
    );
  },

  getOutlooks(): Promise<unknown> {
    return getJson(OUTLOOKS_URL, "getOutlooks");
  },

  async getPrevitempsStations(): Promise<SoundingStation[]> {
    return (
      (await getJson<SoundingStation[]>(
        "/data/previtemps_stations.json",
        "getPrevitempsStations",
      )) ?? []
    );
  },

  /** A catalogue station's forecast sounding; the Function finds its grid
   * point by name, so no coordinates are sent, and passes on the point data,
   * which is turned into levels here. */
  async getEmagramForecast(stationName: string): Promise<Sounding | null> {
    const forecast = await getJson<SoundingForecast>(
      `/api/meteo/previtemps/forecast/${encodeURIComponent(stationName)}`,
      "getEmagramForecast",
    );
    if (!forecast) return null;
    try {
      return soundingFromForecast(forecast);
    } catch (e) {
      console.error("[ShvApi.getEmagramForecast] Unreadable point data:", e);
      return null;
    }
  },
};

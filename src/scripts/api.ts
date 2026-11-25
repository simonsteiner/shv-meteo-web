// ShvApi: the browser's only API client and only caller of fetch. Static
// GIS snapshots come from public/data/ with the upstream CDN as fallback,
// the outlooks and the isobar chart straight from upstream, the DABS card is
// built here, and everything else goes through the Pages Functions under
// /api (docs/architecture/data-queries.md). A failed call logs and resolves
// to null (or an empty list), so a view shows its empty or error state.
import type {
  Bbox,
  Dabs,
  MeasurementFeature,
  ObstacleFeature,
  Sounding,
  SoundingStation,
  TimeseriesResponse,
  Webcam,
} from "./types.ts";
import type { FoehnReport } from "./foehn/report.ts";
import {
  soundingFromForecast,
  type SoundingForecast,
} from "./emagram/sounding.ts";
import { loadObstacles, type ShardIndex } from "./obstacles/cells.ts";
import { keepRecent, type Sized } from "./obstacles/recent.ts";

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

/** Today's date in Switzerland as YYYY-MM-DD, from the parts rather than
 * a locale's layout, which older browsers' ICU data varies. */
function swissDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The DABS card's fields for `now`, as the former /api/dabs returned
 * them, but dated in Swiss time rather than UTC. */
export function buildDabs(now: Date): Dabs {
  const date = swissDate(now);
  return {
    date,
    status: "ACTIVE",
    bulletinUrl: "https://www.skybriefing.com/de/dabs",
    bulletinPdfUrl: "https://www.skybriefing.com/dabs/dabs.pdf",
    validity: `00:00 - 23:59 LT (${date})`,
    notesDe:
      "Täglich ab 16:00 LT für den Folgetag durch Skybriefing publiziert. Vor jedem Streckenflug obligatorisch zu konsultieren!",
    notesEn:
      "Published daily at 16:00 LT for the next day via Skybriefing. Mandatory consultation prior to cross-country flights!",
  };
}

export interface FeatureCollection<F = unknown> {
  type: "FeatureCollection";
  features: F[];
}

/** The JSON at `url`, or null after logging why not. */
async function getJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (resp.ok) return (await resp.json()) as T;
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

/** A GIS snapshot from public/data/, else the upstream CDN; kept for the
 * page's lifetime. Rejects when both fail. */
function snapshot(local: string, cdn: string, label: string) {
  let kept: Promise<FeatureCollection> | null = null;
  const load = async (): Promise<FeatureCollection> => {
    try {
      const resp = await fetch(local);
      if (resp.ok) return (await resp.json()) as FeatureCollection;
      console.warn(
        `[ShvApi.${label}] Local fetch returned status:`,
        resp.status,
      );
    } catch (e) {
      console.warn(
        `[ShvApi.${label}] Local fetch failed, trying live CDN fallback:`,
        e,
      );
    }
    const resp = await fetch(cdn);
    if (!resp.ok) throw new Error(`CDN status ${resp.status}`);
    return (await resp.json()) as FeatureCollection;
  };
  return (): Promise<FeatureCollection> => {
    kept ??= load().catch((err: unknown) => {
      console.error(
        `[ShvApi.${label}] Failed to load from both local and CDN:`,
        err,
      );
      kept = null;
      throw err;
    });
    return kept;
  };
}

const CDN = "https://shv-app-static-prod.ubmeteo.io/v1";

/** A view's obstacles, and whether reading them failed. */
export interface ObstacleAnswer extends FeatureCollection<ObstacleFeature> {
  failed: boolean;
}

// One request per page load: the header's Foehn badge and the view on the
// same page share a call. Keyed by pair, so the pair switcher gets its own.
// A failed call (null) is forgotten, so the next caller asks again.
let measurementsPromise: Promise<FeatureCollection<MeasurementFeature> | null> | null =
  null;
const foehnPromises = new Map<string, Promise<FoehnReport | null>>();

// The obstacle shards (obstacles/cells.ts): the index once per page load,
// and the last cells read, so panning back costs nothing.
const OBSTACLES = "/data/obstacles";
/** The JSON the kept cells may hold, in characters: about a view and a half
 * of the densest area (Valais at z10 reads 22 MB), against up to 120 MB
 * when 64 cells of any size were kept. */
const OBSTACLE_CACHE_BYTES = 32_000_000;
let obstacleIndexPromise: Promise<ShardIndex> | null = null;

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
  getFlyingSites: snapshot(
    "/data/flyingsites.geojson",
    `${CDN}/flyingsites.geojson`,
    "getFlyingSites",
  ),
  getAirspaces: snapshot(
    "/data/airspaces.geojson",
    `${CDN}/airspaces/shv.geojson`,
    "getAirspaces",
  ),
  getWildschutz: snapshot(
    "/data/wildschutz.geojson",
    `${CDN}/wildschutz/shv.geojson`,
    "getWildschutz",
  ),

  /** The obstacles a map view shows, `failed` when its index or any of
   * its cells couldn't be read (the rest still come); rejects only when
   * `signal` aborts. */
  async getObstacles(
    { zoom, ...bbox }: Bbox & { zoom: number },
    options: { signal?: AbortSignal } = {},
  ): Promise<ObstacleAnswer> {
    try {
      obstacleIndexPromise ??= fetchObstacleShard("index.json").then(
        (shard) => shard.value as ShardIndex,
      );
      const index = await obstacleIndexPromise;
      const { features, failed } = await loadObstacles(
        bbox,
        zoom,
        index,
        fetchObstacleCell,
        options.signal,
      );
      // a failed cell leaves a gap: draw the rest, and say so
      return { type: "FeatureCollection", features, failed };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      console.error("[ShvApi.getObstacles] Failed to load obstacles:", err);
      obstacleIndexPromise = null;
    }
    // no obstacles drawn must not read as no obstacles there
    return { type: "FeatureCollection", features: [], failed: true };
  },

  getMeasurements(): Promise<FeatureCollection<MeasurementFeature> | null> {
    if (!measurementsPromise) {
      const pending = getJson<FeatureCollection<MeasurementFeature>>(
        "/api/measurements",
        "getMeasurements",
      ).then((result) => {
        if (result === null && measurementsPromise === pending)
          measurementsPromise = null;
        return result;
      });
      measurementsPromise = pending;
    }
    return measurementsPromise;
  },

  getWebcams(): Promise<{ webcams: Webcam[] } | null> {
    return getJson("/api/webcams", "getWebcams");
  },

  /** The Foehn report with `pairId`'s history; none is KLO_LUG. */
  getFoehn(pairId: string | null = null): Promise<FoehnReport | null> {
    const pair = pairId || "KLO_LUG";
    let pending = foehnPromises.get(pair);
    if (!pending) {
      const request = getJson<FoehnReport>(
        `/api/foehn?pair=${encodeURIComponent(pair)}`,
        "getFoehn",
      ).then((result) => {
        if (result === null && foehnPromises.get(pair) === request)
          foehnPromises.delete(pair);
        return result;
      });
      pending = request;
      foehnPromises.set(pair, pending);
    }
    return pending;
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

  async getDabs(): Promise<Dabs> {
    return buildDabs(new Date());
  },
};

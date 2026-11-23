import { buildDabs, isobarenUrl, OUTLOOKS_URL } from "../scripts/client.ts";
import { loadObstacles } from "../scripts/obstacles/cells.ts";

// In-memory cache for static spatial datasets to prevent repeat download delays
let cachedFlyingSites = null;
let cachedAirspaces = null;
let cachedWildschutz = null;

// One request per page load: the header's Foehn badge and the view on the
// same page share a call. Keyed by pair, so the pair switcher gets its own.
let measurementsPromise = null;

// The obstacle shards (src/scripts/obstacles/cells.ts): the index once per
// page load, and the last cells read, so panning back costs nothing.
const OBSTACLES = "/data/obstacles";
const OBSTACLE_CELLS_KEPT = 64;
let obstacleIndexPromise = null;
const obstacleCells = new Map();
const foehnPromises = new Map();

export class ShvApi {
  static async getFlyingSites() {
    if (cachedFlyingSites) return cachedFlyingSites;
    try {
      const resp = await fetch("/data/flyingsites.geojson");
      if (resp.ok) {
        cachedFlyingSites = await resp.json();
        return cachedFlyingSites;
      }
      console.warn(
        "[ShvApi.getFlyingSites] Local fetch returned status:",
        resp.status,
      );
    } catch (e) {
      console.warn(
        "[ShvApi.getFlyingSites] Local fetch failed, trying live CDN fallback:",
        e,
      );
    }
    try {
      const cdnResp = await fetch(
        "https://shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson",
      );
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedFlyingSites = await cdnResp.json();
      return cachedFlyingSites;
    } catch (err) {
      console.error(
        "[ShvApi.getFlyingSites] Failed to load flying sites from both local and CDN:",
        err,
      );
      throw err;
    }
  }

  static async getAirspaces() {
    if (cachedAirspaces) return cachedAirspaces;
    try {
      const resp = await fetch("/data/airspaces.geojson");
      if (resp.ok) {
        cachedAirspaces = await resp.json();
        return cachedAirspaces;
      }
      console.warn(
        "[ShvApi.getAirspaces] Local fetch returned status:",
        resp.status,
      );
    } catch (e) {
      console.warn(
        "[ShvApi.getAirspaces] Local fetch failed, trying live CDN fallback:",
        e,
      );
    }
    try {
      const cdnResp = await fetch(
        "https://shv-app-static-prod.ubmeteo.io/v1/airspaces/shv.geojson",
      );
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedAirspaces = await cdnResp.json();
      return cachedAirspaces;
    } catch (err) {
      console.error(
        "[ShvApi.getAirspaces] Failed to load airspaces from both local and CDN:",
        err,
      );
      throw err;
    }
  }

  static async getObstacles(
    { minLon, minLat, maxLon, maxLat, zoom },
    options = {},
  ) {
    try {
      if (!obstacleIndexPromise)
        obstacleIndexPromise = ShvApi.fetchObstacleShard("index.json");
      const index = await obstacleIndexPromise;
      const features = await loadObstacles(
        { minLon, minLat, maxLon, maxLat },
        zoom,
        index,
        (path, signal) => ShvApi.fetchObstacleCell(path, signal),
        options.signal,
      );
      return { type: "FeatureCollection", features };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.error("[ShvApi.getObstacles] Failed to load obstacles:", err);
      obstacleIndexPromise = null;
    }
    return { type: "FeatureCollection", features: [] };
  }

  static async fetchObstacleShard(path, signal) {
    const resp = await fetch(`${OBSTACLES}/${path}`, { signal });
    if (!resp.ok) throw new Error(`${path} answered ${resp.status}`);
    return resp.json();
  }

  static async fetchObstacleCell(path, signal) {
    const kept = obstacleCells.get(path);
    if (kept) return kept;
    const cell = await ShvApi.fetchObstacleShard(path, signal);
    obstacleCells.set(path, cell);
    if (obstacleCells.size > OBSTACLE_CELLS_KEPT)
      obstacleCells.delete(obstacleCells.keys().next().value);
    return cell;
  }

  static async getWildschutz() {
    if (cachedWildschutz) return cachedWildschutz;
    try {
      const resp = await fetch("/data/wildschutz.geojson");
      if (resp.ok) {
        cachedWildschutz = await resp.json();
        return cachedWildschutz;
      }
      console.warn(
        "[ShvApi.getWildschutz] Local fetch returned status:",
        resp.status,
      );
    } catch (e) {
      console.warn(
        "[ShvApi.getWildschutz] Local fetch failed, trying live CDN fallback:",
        e,
      );
    }
    try {
      const cdnResp = await fetch(
        "https://shv-app-static-prod.ubmeteo.io/v1/wildschutz/shv.geojson",
      );
      if (!cdnResp.ok) throw new Error(`CDN status ${cdnResp.status}`);
      cachedWildschutz = await cdnResp.json();
      return cachedWildschutz;
    } catch (err) {
      console.error(
        "[ShvApi.getWildschutz] Failed to load wildschutz from both local and CDN:",
        err,
      );
      throw err;
    }
  }

  static getMeasurements() {
    if (!measurementsPromise) measurementsPromise = ShvApi.fetchMeasurements();
    return measurementsPromise;
  }

  static async fetchMeasurements() {
    try {
      const resp = await fetch("/api/measurements");
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getMeasurements] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getMeasurements] Network error:", e);
    }
    return null;
  }

  static async getWebcams() {
    try {
      const resp = await fetch("/api/webcams");
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getWebcams] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getWebcams] Network error:", e);
    }
    return null;
  }

  /** @param {string | null} [pairId] a pair id; none is KLO_LUG */
  static getFoehn(pairId = null) {
    const pair = pairId || "KLO_LUG";
    if (!foehnPromises.has(pair))
      foehnPromises.set(pair, ShvApi.fetchFoehn(pair));
    return foehnPromises.get(pair);
  }

  static async fetchFoehn(pair) {
    try {
      const resp = await fetch(`/api/foehn?pair=${encodeURIComponent(pair)}`);
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getFoehn] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getFoehn] Network error:", e);
    }
    return null;
  }

  static async getTextForecast(lang = "de") {
    try {
      const resp = await fetch(`/api/meteo/text-forecast/${lang}`);
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getTextForecast] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getTextForecast] Network error:", e);
    }
    return null;
  }

  static getIsobarenSvgUrl(lang = "de") {
    return isobarenUrl(lang);
  }

  static async getStationTimeseries(stationId) {
    if (!stationId) return null;
    try {
      const resp = await fetch(
        `/api/measurements/timeseries/${encodeURIComponent(stationId)}`,
      );
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getStationTimeseries] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getStationTimeseries] Network error:", e);
    }
    return null;
  }

  static async getOutlooks() {
    try {
      const resp = await fetch(OUTLOOKS_URL);
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getOutlooks] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getOutlooks] Network error:", e);
    }
    return null;
  }

  static async getPrevitempsStations() {
    try {
      const resp = await fetch("/data/previtemps_stations.json");
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getPrevitempsStations] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getPrevitempsStations] Network error:", e);
    }
    return [];
  }

  static async getEmagramForecast(stationName, lat = null, lon = null) {
    try {
      let url = `/api/meteo/previtemps/forecast/${encodeURIComponent(stationName)}`;
      if (lat !== null && lon !== null) {
        url += `?lat=${lat}&lon=${lon}`;
      }
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getEmagramForecast] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getEmagramForecast] Network error:", e);
    }
    return null;
  }

  static async getPrevitempsSounding(stationName, surfaceTemp, surfaceDew) {
    try {
      let url = `/api/meteo/previtemps/sounding/${encodeURIComponent(stationName)}`;
      const queryParams = [];
      if (surfaceTemp !== undefined && surfaceTemp !== null) {
        queryParams.push(`surface_temp=${surfaceTemp}`);
      }
      if (surfaceDew !== undefined && surfaceDew !== null) {
        queryParams.push(`surface_dew=${surfaceDew}`);
      }
      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getPrevitempsSounding] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getPrevitempsSounding] Network error:", e);
    }
    return null;
  }

  static async getEmagramSounding() {
    try {
      const resp = await fetch("/api/emagram/sounding");
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.getEmagramSounding] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.getEmagramSounding] Network error:", e);
    }
    return null;
  }

  static async calculateEmagram(surfaceTempC, surfaceDewC) {
    try {
      const resp = await fetch("/api/emagram/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface_temp_c: surfaceTempC,
          surface_dew_c: surfaceDewC,
        }),
      });
      if (resp.ok) return await resp.json();
      console.error(
        "[ShvApi.calculateEmagram] HTTP error:",
        resp.status,
        resp.statusText,
      );
    } catch (e) {
      console.error("[ShvApi.calculateEmagram] Network error:", e);
    }
    return null;
  }

  static async getDabs() {
    return buildDabs(new Date());
  }
}

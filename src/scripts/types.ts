// Domain and API shapes shared by functions/ and the browser bundle,
// imported with `import type`. Named after GLOSSARY.md; the upstream JSON
// keeps its own field names. Grows one PR at a time; near the token budget
// it splits into src/scripts/types/<concern>.ts.

/** What a Pages Function receives; hand-written rather than pulling in
 * @cloudflare/workers-types. The site has no bindings, so `env` is empty. */
export interface Context {
  request: Request;
  env: Record<string, never>;
  params: Record<string, string | string[]>;
  waitUntil(p: Promise<unknown>): void;
}

/** A weather station's latest values (`/api/measurements`), a GeoJSON Point
 * feature whose id is `<provider>:<id>`, e.g. `meteo_swiss:KLO`. Wind and
 * gusts arrive in km/h; a temperature above 200 is Kelvin, a pressure above
 * 5000 is in tenths of hPa. */
export interface MeasurementFeature {
  type?: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [lon: number, lat: number] };
  properties: {
    providerKey?: string;
    stationIdentifier?: string;
    name?: string;
    altitude?: number;
    windSpeedValue?: number | null;
    windDirectionValue?: number | null;
    windGustValue?: number | null;
    temperature2mValue?: number | null;
    [key: string]: unknown;
  };
}

/** A station's recent series (`/api/measurements/timeseries/<id>`), one
 * per parameter (`temperature`, `pressure_msl`, `wind_speed`, ...). */
export interface TimeseriesResponse {
  id: string;
  name?: string;
  timeseries: {
    parameter: string;
    measurements: { time: number; value: number | null }[];
  }[];
}

/** A webcam from `/api/webcams`; `identifier` is `<provider>:<id>`. */
export interface Webcam {
  identifier: string;
  name: string;
  latitude: number;
  longitude: number;
  latestImageUrl?: string;
  thumbnailUrl?: string;
  [key: string]: unknown;
}

/** The Daily Airspace Bulletin Switzerland card on the safety page. */
export interface Dabs {
  date: string;
  status: "ACTIVE";
  bulletinUrl: string;
  bulletinPdfUrl: string;
  validity: string;
  notesDe: string;
  notesEn: string;
}

/** A station of the sounding catalogue (public/data/previtemps_stations.json). */
export interface SoundingStation {
  name: string;
  lat: number;
  lon: number;
  elevation: number;
}

export type IconModelKey = "meteo_swiss:icon_ch1" | "meteo_swiss:icon_ch2";

/** A catalogue station's ICON grid point (src/data/previtemps_grid.json). */
export interface GridPoint {
  name: string;
  modelKey: IconModelKey;
  model: "ICON-CH1" | "ICON-CH2";
  pointIndex: number;
  elevation: number;
  latitude: number;
  longitude: number;
}

/** Every catalogue station's grid point, by lower-cased name. */
export type PrevitempsGrid = Record<string, GridPoint>;

/** One model level of a sounding, ground first. */
export interface SoundingLevel {
  heightM: number;
  pressHpa: number;
  tempC: number;
  dewC: number;
  speedKmH: number;
  dirDeg: number;
  /** °C per 100 m from the level below; 0 for the first level and when the
   * two are 10 m or less apart. */
  lapseRate: number;
}

/** A station's ICON forecast sounding over every time step of the latest
 * run (/api/meteo/previtemps/forecast/<name>). */
export interface Sounding {
  stationName: string;
  model: GridPoint["model"];
  run: number;
  elevation: number;
  latitude: number;
  longitude: number;
  validTimes: number[];
  timeSteps: { timestamp: number; levels: SoundingLevel[] }[];
}

/** A BAZL aviation obstacle as the map draws it: a GeoJSON feature with
 * the properties the map's icons, LOD rules and bottom sheet read, plus
 * `_uid`, the key that identifies it across cells. */
export interface ObstacleFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown };
  properties: {
    id?: string;
    sourceId?: string;
    partIndex?: number | null;
    obstacleType?: string;
    marking?: string;
    lighting?: string;
    maxHeightAgl?: number | null;
    topElevationAmsl?: number | null;
    styleId?: string;
    airport?: string | null;
    geometryType?: string;
    small?: boolean;
    _uid?: string;
  };
}

/** A lon/lat box. */
export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

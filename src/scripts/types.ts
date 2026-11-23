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

// The GIS datasets the map draws, as the SHV CDN serves them (regenerated
// there every hour). The site reads them live; only `npm run dev` may read
// a local copy instead, which `npm run gis` writes into the git-ignored
// GIS_DEV_DIR, so a built page can never show a stale copy.

const CDN = "https://shv-app-static-prod.ubmeteo.io/v1";

export interface GisDataset {
  /** Where the browser reads it. */
  url: string;
  /** Its local copy's name under GIS_DEV_DIR. */
  file: string;
}

export const GIS_DATASETS = {
  flyingSites: {
    url: `${CDN}/flyingsites.geojson`,
    file: "flyingsites.geojson",
  },
  airspaces: { url: `${CDN}/airspaces/shv.geojson`, file: "airspaces.geojson" },
  wildschutz: {
    url: `${CDN}/wildschutz/shv.geojson`,
    file: "wildschutz.geojson",
  },
} as const satisfies Record<string, GisDataset>;

/** The local copies' folder under public/, as the dev server serves it. */
export const GIS_DEV_DIR = "/data/gis";

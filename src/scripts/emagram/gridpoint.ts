// Which ICON grid point stands for a catalogue station: the zoom-10 grid
// tiles within NEAR_KM of its coordinates (static-prod.ubmeteo.io), so a
// station by a tile's edge also sees the points beyond it; ICON-CH1's
// points if any tile has them, else ICON-CH2's; and the nearest of those in
// kilometres (longitude scaled by the cosine of the latitude). Pure;
// scripts/previtemps-grid.ts fetches the tiles and writes the result.
import { isRecord, num, obj } from "../coerce.ts";
import type { GridPoint, IconModelKey, SoundingStation } from "../types.ts";

/** The zoom-10 EPSG:4326 tile holding a coordinate (from the official app). */
export function tileIndex(lat: number, lon: number): { x: number; y: number } {
  return {
    x: Math.floor((180 + lon) / 0.3515625),
    y: Math.floor((90 - lat) / 0.17578125),
  };
}

export function tileUrl(lat: number, lon: number): string {
  const { x, y } = tileIndex(lat, lon);
  return `https://static-prod.ubmeteo.io/v1/products/grid/10/${x}/${y}.json`;
}

/** How far around a station its grid point may lie: ICON-CH2's points are
 * about 2 km apart. */
const NEAR_KM = 3;
const KM_PER_DEGREE = 111.2;

/** The tiles a box of NEAR_KM around the coordinate touches: its own
 * first, then any it reaches into. */
export function tileUrlsNear(lat: number, lon: number): string[] {
  const dLat = NEAR_KM / KM_PER_DEGREE;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const urls = [tileUrl(lat, lon)];
  for (const la of [lat - dLat, lat, lat + dLat])
    for (const lo of [lon - dLon, lon, lon + dLon]) {
      const url = tileUrl(la, lo);
      if (!urls.includes(url)) urls.push(url);
    }
  return urls;
}

/** The distance in km between two coordinates, flat-earth: plenty over a
 * few km. */
function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const cos = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot(lat2 - lat1, (lon2 - lon1) * cos) * KM_PER_DEGREE;
}

interface TilePoint {
  pointIndex: number;
  coordinate: { latitude: number; longitude: number; elevation: number | null };
}

const MODELS: { key: IconModelKey; model: GridPoint["model"] }[] = [
  { key: "meteo_swiss:icon_ch1", model: "ICON-CH1" },
  { key: "meteo_swiss:icon_ch2", model: "ICON-CH2" },
];

/** A grid point of the tile, checked; throws, naming the station, when it
 * lacks a numeric index, latitude or longitude. */
function tilePoint(p: unknown, station: SoundingStation): TilePoint {
  const c = obj(obj(p).coordinate);
  const pointIndex = num(obj(p).pointIndex);
  const latitude = num(c.latitude);
  const longitude = num(c.longitude);
  if (pointIndex === null || latitude === null || longitude === null)
    throw new Error(
      `Grid tile for ${station.name} has a grid point without pointIndex, latitude and longitude`,
    );
  return {
    pointIndex,
    coordinate: { latitude, longitude, elevation: num(c.elevation) },
  };
}

/** The grid points of the first definition offering `key`, or none. */
function pointsFor(
  defs: unknown[],
  key: IconModelKey,
  station: SoundingStation,
): TilePoint[] {
  for (const d of defs) {
    if (!isRecord(d))
      throw new Error(
        `Grid tile for ${station.name} has a definition that is not an object`,
      );
    const products = Array.isArray(d.products) ? d.products : [];
    if (!products.some((p) => isRecord(p) && p.identifier === key)) continue;
    const points = Array.isArray(d.gridPoints) ? d.gridPoints : [];
    return points.map((p) => tilePoint(p, station));
  }
  return [];
}

/** The station's grid point in `tiles` (tileUrlsNear's); throws, naming
 * the station, when no tile has ICON-CH1 or ICON-CH2 points, or one is
 * misshapen. */
export function nearestGridPoint(
  tiles: unknown[],
  station: SoundingStation,
): GridPoint {
  const allDefs = tiles.map((tile) => {
    const defs = obj(tile).definitions;
    if (!Array.isArray(defs))
      throw new Error(`Grid tile for ${station.name} has no definitions array`);
    return defs;
  });
  for (const { key, model } of MODELS) {
    const points = allDefs.flatMap((defs) => pointsFor(defs, key, station));
    if (points.length === 0) continue;
    let nearest = points[0];
    let best = Infinity;
    for (const pt of points) {
      const d = km(
        station.lat,
        station.lon,
        pt.coordinate.latitude,
        pt.coordinate.longitude,
      );
      if (d < best) {
        best = d;
        nearest = pt;
      }
    }
    return {
      name: station.name,
      modelKey: key,
      model,
      pointIndex: nearest.pointIndex,
      elevation: Math.round(nearest.coordinate.elevation ?? 0),
      latitude: nearest.coordinate.latitude,
      longitude: nearest.coordinate.longitude,
    };
  }
  throw new Error(`No ICON-CH1 or ICON-CH2 grid point for ${station.name}`);
}

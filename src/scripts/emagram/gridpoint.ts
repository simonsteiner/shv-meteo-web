// Which ICON grid point stands for a catalogue station: the zoom-10 grid
// tile holding its coordinates (static-prod.ubmeteo.io), ICON-CH1's points
// if the tile has them, else ICON-CH2's, and the nearest of those. Pure;
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

/** The station's grid point in `tile`; throws, naming the station, when the
 * tile has neither ICON-CH1 nor ICON-CH2 points, or is misshapen. */
export function nearestGridPoint(
  tile: unknown,
  station: SoundingStation,
): GridPoint {
  const defs = obj(tile).definitions;
  if (!Array.isArray(defs))
    throw new Error(`Grid tile for ${station.name} has no definitions array`);
  for (const { key, model } of MODELS) {
    const points = pointsFor(defs, key, station);
    if (points.length === 0) continue;
    let nearest = points[0];
    let best = Infinity;
    for (const pt of points) {
      const d = Math.hypot(
        pt.coordinate.latitude - station.lat,
        pt.coordinate.longitude - station.lon,
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

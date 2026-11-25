// Which ICON grid point stands for a catalogue station: the zoom-10 grid
// tile holding its coordinates (static-prod.ubmeteo.io), ICON-CH1's points
// if the tile has them, else ICON-CH2's, and the nearest of those. Pure;
// scripts/previtemps-grid.ts fetches the tiles and writes the result.
import { obj } from "../coerce.ts";
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
  coordinate: { latitude: number; longitude: number; elevation?: number };
}
interface Tile {
  definitions?: {
    products?: { identifier: string }[];
    gridPoints?: TilePoint[];
  }[];
}

const MODELS: { key: IconModelKey; model: GridPoint["model"] }[] = [
  { key: "meteo_swiss:icon_ch1", model: "ICON-CH1" },
  { key: "meteo_swiss:icon_ch2", model: "ICON-CH2" },
];

/** The station's grid point in `tile`; throws, naming the station, when the
 * tile has neither ICON-CH1 nor ICON-CH2 points. */
export function nearestGridPoint(
  tile: unknown,
  station: SoundingStation,
): GridPoint {
  const raw = obj(tile).definitions;
  if (!Array.isArray(raw))
    throw new Error(`Grid tile for ${station.name} has no definitions array`);
  const defs: NonNullable<Tile["definitions"]> = raw;
  for (const { key, model } of MODELS) {
    const def = defs.find((d) => d.products?.some((p) => p.identifier === key));
    const points = def?.gridPoints ?? [];
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

// The BAZL obstacles as build-time shards (scripts/obstacles.ts writes
// them, the client reads them): one tier per LOD cut point, each holding
// every feature visible from its zoom, cut into cells of a fixed size in
// degrees, so any view needs a few files of one tier. Files live at
// /data/obstacles/<tier>/<gx>_<gy>.json; index.json lists the cells that
// exist, so the client never asks for an empty one. A cell over 2 MB is
// written as four quarters, named in its file's `parts` as `<cell>.<i>`
// (and `<cell>.<i>.<j>` for a quarter split again), i the quarter: 0 south
// west, 1 south east, 2 north west, 3 north east (shards.ts), so the client
// reads only the quarters its view touches.
import type { Bbox, ObstacleFeature } from "../types.ts";
import { bboxOf, capFeatures, intersects } from "./lod.ts";

export interface Tier {
  name: string;
  /** The zoom whose LOD the tier holds. */
  zoom: number;
  /** Cell edge in degrees. */
  size: number;
}

/** The LOD cut points; 1 degree cells at low zoom, a quarter from z11. */
export const TIERS: Tier[] = [
  { name: "z7", zoom: 7, size: 1 },
  { name: "z9", zoom: 9, size: 1 },
  { name: "z10", zoom: 10, size: 0.5 },
  { name: "z11", zoom: 11, size: 0.25 },
  { name: "z12", zoom: 12, size: 0.25 },
  { name: "z13", zoom: 13, size: 0.25 },
];

/** The tier a map at `zoom` reads; null below z7, where nothing shows. */
export function tierFor(zoom: number): Tier | null {
  let found: Tier | null = null;
  for (const tier of TIERS) if (zoom >= tier.zoom) found = tier;
  return found;
}

/** Every cell of `tier` that a box touches, padded by `pad` cells. */
function cellsOfBox(box: Bbox, tier: Tier, pad: number): string[] {
  const s = tier.size;
  const keys: string[] = [];
  for (
    let gx = Math.floor(box.minLon / s) - pad;
    gx <= Math.floor(box.maxLon / s) + pad;
    gx++
  )
    for (
      let gy = Math.floor(box.minLat / s) - pad;
      gy <= Math.floor(box.maxLat / s) + pad;
      gy++
    )
      keys.push(`${gx}_${gy}`);
  return keys;
}

/** The cells a view loads: those its box touches. Not padded by a cell, as
 * planned: MapView already pads the box by 20%, and a cell more on each
 * side made 35 to 45 files a view at z10 and z11. */
export function cellsFor(bbox: Bbox, tier: Tier): string[] {
  return cellsOfBox(bbox, tier, 0);
}

/** The cells a feature is written to: every one its box touches. */
export function cellsOf(f: ObstacleFeature, tier: Tier): string[] {
  const box = bboxOf(f.geometry);
  if (!Number.isFinite(box.minLon)) return [];
  return cellsOfBox(box, tier, 0);
}

/** The box a cell covers. */
export function cellBox(key: string, tier: Tier): Bbox {
  const [gx, gy] = key.split("_").map(Number);
  return {
    minLon: gx * tier.size,
    minLat: gy * tier.size,
    maxLon: (gx + 1) * tier.size,
    maxLat: (gy + 1) * tier.size,
  };
}

/** The box of a cell or of one of its quarters, from its name: `16_94`,
 * `16_94.3`, `16_94.3.0`. */
export function partBox(name: string, tier: Tier): Bbox {
  const [key, ...quarters] = name.split(".");
  let box = cellBox(key, tier);
  for (const q of quarters) {
    const i = Number(q);
    const midLon = (box.minLon + box.maxLon) / 2;
    const midLat = (box.minLat + box.maxLat) / 2;
    box = {
      minLon: i % 2 === 0 ? box.minLon : midLon,
      maxLon: i % 2 === 0 ? midLon : box.maxLon,
      minLat: i < 2 ? box.minLat : midLat,
      maxLat: i < 2 ? midLat : box.maxLat,
    };
  }
  return box;
}

/** index.json: the cells each tier has. */
export interface ShardIndex {
  generatedAt: string;
  tiers: Record<string, string[]>;
}

/** A cell file: its features, or the quarters it was split into. */
export type ShardFile =
  | { type: "FeatureCollection"; features: ObstacleFeature[] }
  | { parts: string[] };

export type FetchJson = (
  path: string,
  signal?: AbortSignal,
) => Promise<unknown>;

/** The obstacles a view shows: the tier's cells around `bbox`, only the
 * quarters of a split cell that `bbox` touches, deduped by `_uid` (a
 * feature lies in every cell it touches), cut to `bbox` and capped. A cell
 * that fails to load counts as empty, logged, and sets `failed`, so the
 * view's gap isn't read as no obstacles there. */
export async function loadObstacles(
  bbox: Bbox,
  zoom: number,
  index: ShardIndex,
  fetchJson: FetchJson,
  signal?: AbortSignal,
): Promise<{ features: ObstacleFeature[]; failed: boolean }> {
  const tier = tierFor(zoom);
  if (!tier) return { features: [], failed: false };
  let failed = false;
  const have = new Set(index.tiers[tier.name] ?? []);
  const keys = cellsFor(bbox, tier).filter((k) => have.has(k));

  const load = async (name: string): Promise<ObstacleFeature[]> => {
    const file = (await fetchJson(
      `${tier.name}/${name}.json`,
      signal,
    )) as ShardFile;
    if ("parts" in file) {
      const touched = file.parts.filter((part) =>
        intersects(partBox(part, tier), bbox),
      );
      return (await Promise.all(touched.map(load))).flat();
    }
    return file.features ?? [];
  };
  const loaded = await Promise.all(
    keys.map((k) =>
      load(k).catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") throw err;
        console.error(
          `[obstacles] Cell ${tier.name}/${k} failed, left empty:`,
          err,
        );
        failed = true;
        return [];
      }),
    ),
  );

  const seen = new Set<string>();
  const features: ObstacleFeature[] = [];
  for (const f of loaded.flat()) {
    const uid = f.properties._uid ?? "";
    if (seen.has(uid) || !intersects(bboxOf(f.geometry), bbox)) continue;
    seen.add(uid);
    features.push(f);
  }
  return { features: capFeatures(features), failed };
}

// The shard writer behind `npm run obstacles` (scripts/obstacles.ts), pure
// so it can be tested: for each tier it puts the features visible from that
// tier's zoom into every cell their box touches, and only cells that hold a
// feature are written. A cell over `maxBytes` goes into four quarters,
// recursively up to four times, and its own file lists the parts.
import type { Bbox, ObstacleFeature } from "../types.ts";
import { cellBox, cellsOf, type ShardIndex, type Tier } from "./cells.ts";
import { bboxOf, intersects, visibleAt } from "./lod.ts";

/** Writes `json` to `path`, relative to the shard root. */
export type WriteShard = (path: string, json: string) => void;

export interface ShardStats {
  index: ShardIndex;
  files: number;
  largest: number;
}

const MAX_SHARD_BYTES = 2_000_000;
const MAX_SPLITS = 4;

export function buildShards(
  all: ObstacleFeature[],
  tiers: Tier[],
  write: WriteShard,
  { maxBytes = MAX_SHARD_BYTES, now = new Date() } = {},
): ShardStats {
  const index: ShardIndex = { generatedAt: now.toISOString(), tiers: {} };
  let files = 0;
  let largest = 0;

  const writeCell = (
    dir: string,
    name: string,
    box: Bbox,
    features: ObstacleFeature[],
    depth = 0,
  ): void => {
    const json = JSON.stringify({ type: "FeatureCollection", features });
    if (json.length <= maxBytes || depth >= MAX_SPLITS) {
      if (json.length > maxBytes)
        console.error(
          `[obstacles] ${name} stays at ${json.length} B after ${MAX_SPLITS} splits`,
        );
      write(`${dir}/${name}.json`, json);
      files++;
      largest = Math.max(largest, json.length);
      return;
    }
    const midLon = (box.minLon + box.maxLon) / 2;
    const midLat = (box.minLat + box.maxLat) / 2;
    const quarters: Bbox[] = [
      {
        minLon: box.minLon,
        minLat: box.minLat,
        maxLon: midLon,
        maxLat: midLat,
      },
      {
        minLon: midLon,
        minLat: box.minLat,
        maxLon: box.maxLon,
        maxLat: midLat,
      },
      {
        minLon: box.minLon,
        minLat: midLat,
        maxLon: midLon,
        maxLat: box.maxLat,
      },
      {
        minLon: midLon,
        minLat: midLat,
        maxLon: box.maxLon,
        maxLat: box.maxLat,
      },
    ];
    const parts: string[] = [];
    quarters.forEach((q, i) => {
      const inside = features.filter((f) => intersects(bboxOf(f.geometry), q));
      if (inside.length === 0) return;
      parts.push(`${name}.${i}`);
      writeCell(dir, `${name}.${i}`, q, inside, depth + 1);
    });
    write(`${dir}/${name}.json`, JSON.stringify({ parts }));
    files++;
  };

  for (const tier of tiers) {
    const cells = new Map<string, ObstacleFeature[]>();
    for (const f of all) {
      if (!visibleAt(f, tier.zoom)) continue;
      for (const key of cellsOf(f, tier)) {
        const list = cells.get(key);
        if (list) list.push(f);
        else cells.set(key, [f]);
      }
    }
    for (const [key, features] of cells)
      writeCell(tier.name, key, cellBox(key, tier), features);
    index.tiers[tier.name] = [...cells.keys()].sort();
    console.log(`${tier.name}: ${cells.size} cells`);
  }
  return { index, files, largest };
}

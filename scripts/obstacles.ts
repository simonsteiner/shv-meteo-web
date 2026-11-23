// `npm run obstacles`: the BAZL obstacle shards the map reads, under
// public/data/obstacles/ (git-ignored; deploy.yml builds them before every
// deploy and once a day). Downloads the full dataset (about 128 MB) to
// .cache/obstacles/bazl.geojson unless a copy under a day old is there, or
// reads `--source FILE`. For each tier (src/scripts/obstacles/cells.ts) it
// writes the features visible from that tier's zoom into every cell their
// box touches; a cell over 2 MB goes into four quarters, recursively.
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  cellBox,
  cellsOf,
  TIERS,
  type ShardIndex,
} from "../src/scripts/obstacles/cells.ts";
import {
  bboxOf,
  intersects,
  slim,
  visibleAt,
} from "../src/scripts/obstacles/lod.ts";
import type { Bbox, ObstacleFeature } from "../src/scripts/types.ts";
import { USER_AGENT } from "../src/scripts/upstream/routes.ts";

const SOURCE_URL =
  "https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson";
const CACHED = ".cache/obstacles/bazl.geojson";
const OUT = "public/data/obstacles";
const MAX_BYTES = 2_000_000;
const DAY_MS = 24 * 3600 * 1000;

const { values } = parseArgs({ options: { source: { type: "string" } } });

async function source(): Promise<string> {
  if (values.source) return values.source;
  if (existsSync(CACHED) && Date.now() - statSync(CACHED).mtimeMs < DAY_MS)
    return CACHED;
  console.log(`downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`${SOURCE_URL} answered ${res.status}`);
  mkdirSync(dirname(CACHED), { recursive: true });
  writeFileSync(CACHED, Buffer.from(await res.arrayBuffer()));
  return CACHED;
}

let files = 0;
let largest = 0;

/** Writes a cell, or its quarters when it is over MAX_BYTES; returns nothing. */
function writeCell(
  dir: string,
  name: string,
  box: Bbox,
  features: ObstacleFeature[],
  depth = 0,
): void {
  const json = JSON.stringify({ type: "FeatureCollection", features });
  if (json.length <= MAX_BYTES || depth >= 4) {
    if (json.length > MAX_BYTES)
      console.error(
        `[obstacles] ${name} stays at ${json.length} B after 4 splits`,
      );
    writeFileSync(join(dir, `${name}.json`), json);
    files++;
    largest = Math.max(largest, json.length);
    return;
  }
  const midLon = (box.minLon + box.maxLon) / 2;
  const midLat = (box.minLat + box.maxLat) / 2;
  const quarters: Bbox[] = [
    { minLon: box.minLon, minLat: box.minLat, maxLon: midLon, maxLat: midLat },
    { minLon: midLon, minLat: box.minLat, maxLon: box.maxLon, maxLat: midLat },
    { minLon: box.minLon, minLat: midLat, maxLon: midLon, maxLat: box.maxLat },
    { minLon: midLon, minLat: midLat, maxLon: box.maxLon, maxLat: box.maxLat },
  ];
  const parts: string[] = [];
  quarters.forEach((q, i) => {
    const inside = features.filter((f) => intersects(bboxOf(f.geometry), q));
    if (inside.length === 0) return;
    parts.push(`${name}.${i}`);
    writeCell(dir, `${name}.${i}`, q, inside, depth + 1);
  });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ parts }));
  files++;
}

const raw = JSON.parse(await readFile(await source(), "utf8")) as {
  features?: ObstacleFeature[];
};
const all = (raw.features ?? []).map(slim);
rmSync(OUT, { recursive: true, force: true });
const index: ShardIndex = { generatedAt: new Date().toISOString(), tiers: {} };
for (const tier of TIERS) {
  const cells = new Map<string, ObstacleFeature[]>();
  for (const f of all) {
    if (!visibleAt(f, tier.zoom)) continue;
    for (const key of cellsOf(f, tier)) {
      const list = cells.get(key);
      if (list) list.push(f);
      else cells.set(key, [f]);
    }
  }
  const dir = join(OUT, tier.name);
  mkdirSync(dir, { recursive: true });
  for (const [key, features] of cells)
    writeCell(dir, key, cellBox(key, tier), features);
  index.tiers[tier.name] = [...cells.keys()].sort();
  console.log(`${tier.name}: ${cells.size} cells`);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(
  `wrote ${files} files from ${all.length} features to ${OUT}; largest ${largest} B`,
);

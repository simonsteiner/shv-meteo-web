// `npm run obstacles`: the BAZL obstacle shards the map reads, under
// public/data/obstacles/ (git-ignored; deploy.yml builds them before every
// deploy and once a day). Downloads the full dataset (about 128 MB) to
// .cache/obstacles/bazl.geojson unless a copy under a day old is there, or
// reads `--source FILE`. For each tier (src/scripts/obstacles/cells.ts) it
// writes the features visible from that tier's zoom into every cell their
// box touches; a cell over 2 MB goes into four quarters, recursively.
// When the download fails, an older copy (deploy.yml restores yesterday's)
// is used, logged; a payload without features fails the script, so a deploy
// never ships an empty obstacle layer.
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
import { TIERS } from "../src/scripts/obstacles/cells.ts";
import { slim } from "../src/scripts/obstacles/lod.ts";
import { buildShards } from "../src/scripts/obstacles/shards.ts";
import type { ObstacleFeature } from "../src/scripts/types.ts";
import { USER_AGENT } from "../src/scripts/upstream/routes.ts";

const SOURCE_URL =
  "https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson";
const CACHED = ".cache/obstacles/bazl.geojson";
const OUT = "public/data/obstacles";
const DAY_MS = 24 * 3600 * 1000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const { values } = parseArgs({ options: { source: { type: "string" } } });

async function download(): Promise<void> {
  console.log(`downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${SOURCE_URL} answered ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(CACHED), { recursive: true });
  writeFileSync(CACHED, data);
}

async function source(): Promise<string> {
  if (values.source) return values.source;
  if (existsSync(CACHED) && Date.now() - statSync(CACHED).mtimeMs < DAY_MS)
    return CACHED;
  try {
    await download();
  } catch (err) {
    if (!existsSync(CACHED)) throw err;
    const from = statSync(CACHED).mtime.toISOString();
    console.error(
      `[obstacles] Download failed, using the cached copy from ${from}:`,
      err,
    );
  }
  return CACHED;
}

const raw = JSON.parse(await readFile(await source(), "utf8")) as {
  features?: unknown;
};
if (!Array.isArray(raw.features) || raw.features.length === 0)
  throw new Error("[obstacles] the dataset holds no features");
const all = (raw.features as ObstacleFeature[]).map(slim);
rmSync(OUT, { recursive: true, force: true });
const { index, files, largest } = buildShards(all, TIERS, (path, json) => {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, json);
});
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(
  `wrote ${files} files from ${all.length} features to ${OUT}; largest ${largest} B`,
);

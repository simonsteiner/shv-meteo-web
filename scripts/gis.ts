// `npm run gis`: local copies of the SHV CDN's GIS datasets (flying sites,
// airspaces, wildlife reserves) under public/data/gis/ (git-ignored), which
// only `npm run dev` reads (ShvApi, src/scripts/api.ts); a built site always
// reads the CDN. Rerun it to refresh them; delete the folder to read the
// CDN in dev too. A payload without features fails the script and keeps the
// old copy.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIS_DATASETS, GIS_DEV_DIR } from "../src/scripts/gis.ts";
import { USER_AGENT } from "../src/scripts/upstream/fetch.ts";

const OUT = join("public", GIS_DEV_DIR);
const TIMEOUT_MS = 60 * 1000;

mkdirSync(OUT, { recursive: true });
for (const { url, file } of Object.values(GIS_DATASETS)) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`[gis] ${url} answered ${res.status}`);
  const text = await res.text();
  const { features } = JSON.parse(text) as { features?: unknown };
  if (!Array.isArray(features) || features.length === 0)
    throw new Error(`[gis] ${url} holds no features`);
  writeFileSync(join(OUT, file), text);
  console.log(`${join(OUT, file)}: ${features.length} features`);
}

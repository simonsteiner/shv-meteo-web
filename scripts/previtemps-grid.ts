// `npm run grid`: resolves each station of the sounding catalogue
// (public/data/previtemps_stations.json) to its ICON grid point once, from
// the zoom-10 grid tiles (needs network), and writes
// src/data/previtemps_grid.json, which the forecast Function imports. Rerun
// when the catalogue changes, or when a station's sounding answers 503 for
// a day (the grid moved). A station with no ICON-CH1 or ICON-CH2 grid fails
// the script, naming it.
import { readFileSync, writeFileSync } from "node:fs";
import { nearestGridPoint, tileUrl } from "../src/scripts/emagram/gridpoint.ts";
import type { PrevitempsGrid, SoundingStation } from "../src/scripts/types.ts";

const STATIONS = "public/data/previtemps_stations.json";
const OUT = "src/data/previtemps_grid.json";

const stations = JSON.parse(
  readFileSync(STATIONS, "utf8"),
) as SoundingStation[];
const tiles = new Map<string, Promise<unknown>>();

function tile(url: string): Promise<unknown> {
  let pending = tiles.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return res.json();
    });
    tiles.set(url, pending);
  }
  return pending;
}

const grid: PrevitempsGrid = {};
for (const station of stations) {
  const point = nearestGridPoint(
    await tile(tileUrl(station.lat, station.lon)),
    station,
  );
  grid[station.name.toLowerCase()] = point;
}
writeFileSync(OUT, `${JSON.stringify(grid, null, 2)}\n`);
const ch2 = Object.values(grid).filter((p) => p.model === "ICON-CH2").length;
console.log(
  `wrote ${OUT}: ${stations.length} stations, ${ch2} on ICON-CH2, ${tiles.size} tiles`,
);

// A sounding station's grid point by name, from the grid `npm run grid`
// writes. `GRID` is that file, built into the Function; `gridPoint` takes
// the grid as a parameter so its test can use a small one.
import data from "../../data/previtemps_grid.json" with { type: "json" };
import type { GridPoint, PrevitempsGrid } from "../types.ts";

export const GRID = data as PrevitempsGrid;

/** The station's grid point, matched case-insensitively on the decoded
 * name (`Zürich`, `Disentis/Mustér`); null for a name not in the catalogue. */
export function gridPoint(
  name: string,
  grid: PrevitempsGrid,
): GridPoint | null {
  const key = name.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(grid, key) ? grid[key] : null;
}

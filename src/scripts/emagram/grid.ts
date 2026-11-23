// A sounding station's grid point by name, from the grid `npm run grid`
// writes. The grid is a parameter: only the Function imports the JSON.
import type { GridPoint, PrevitempsGrid } from "../types.ts";

/** The station's grid point, matched case-insensitively on the decoded
 * name (`Zürich`, `Disentis/Mustér`); null for a name not in the catalogue. */
export function gridPoint(
  name: string,
  grid: PrevitempsGrid,
): GridPoint | null {
  const key = name.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(grid, key) ? grid[key] : null;
}

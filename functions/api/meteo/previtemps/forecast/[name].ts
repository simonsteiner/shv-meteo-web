import grid from "../../../../../src/data/previtemps_grid.json";
import { soundingRoute } from "../../../../../src/scripts/emagram/fetch.ts";
import type {
  Context,
  PrevitempsGrid,
} from "../../../../../src/scripts/types.ts";

export const onRequestGet = (ctx: Context) =>
  soundingRoute(ctx, grid as PrevitempsGrid);

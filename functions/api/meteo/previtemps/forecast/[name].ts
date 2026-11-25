import { soundingRoute } from "../../../../../src/scripts/emagram/fetch.ts";
import type { Context } from "../../../../../src/scripts/types.ts";

export const onRequestGet = (ctx: Context) => soundingRoute(ctx);

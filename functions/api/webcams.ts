import type { Context } from "../../src/scripts/types.ts";
import { proxy } from "../../src/scripts/upstream/respond.ts";

export const onRequestGet = (ctx: Context) => proxy("webcams", ctx);

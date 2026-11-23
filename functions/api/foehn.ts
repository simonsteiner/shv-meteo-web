import { foehnResponse } from "../../src/scripts/foehn/fetch.ts";
import type { Context } from "../../src/scripts/types.ts";
import { serve } from "../../src/scripts/upstream/respond.ts";

export const onRequestGet = (ctx: Context) =>
  serve("foehn", ctx, ({ pair }) => foehnResponse(pair));

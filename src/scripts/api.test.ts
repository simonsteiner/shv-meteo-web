import assert from "node:assert/strict";
import { test } from "node:test";
import { ShvApi } from "../services/api.js";

test("getFoehn() twice makes one fetch, getFoehn('GVE_GUT') a second", async () => {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Response.json({ history: [] });
  }) as typeof fetch;
  try {
    await Promise.all([
      ShvApi.getFoehn(),
      ShvApi.getFoehn(),
      ShvApi.getFoehn("KLO_LUG"),
    ]);
    assert.deepEqual(calls, ["/api/foehn?pair=KLO_LUG"]);
    await ShvApi.getFoehn("GVE_GUT");
    assert.deepEqual(calls, [
      "/api/foehn?pair=KLO_LUG",
      "/api/foehn?pair=GVE_GUT",
    ]);
    await Promise.all([ShvApi.getMeasurements(), ShvApi.getMeasurements()]);
    assert.equal(calls.filter((u) => u === "/api/measurements").length, 1);
  } finally {
    globalThis.fetch = real;
  }
});

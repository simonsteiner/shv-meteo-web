import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObstacleFeature } from "../types.ts";
import {
  cellsFor,
  cellsOf,
  loadObstacles,
  partBox,
  tierFor,
  type ShardIndex,
} from "./cells.ts";

const tier = (zoom: number) => tierFor(zoom)?.name ?? null;

test("each zoom picks its tier", () => {
  assert.equal(tier(6.9), null);
  assert.equal(tier(7), "z7");
  assert.equal(tier(8.7), "z7");
  assert.equal(tier(9), "z9");
  assert.equal(tier(10.5), "z10");
  assert.equal(tier(11), "z11");
  assert.equal(tier(12), "z12");
  assert.equal(tier(13), "z13");
  assert.equal(tier(18), "z13");
});

test("a bbox gives the cells it touches", () => {
  const z9 = tierFor(9)!;
  assert.deepEqual(
    cellsFor({ minLon: 7.2, minLat: 46.1, maxLon: 7.8, maxLat: 46.4 }, z9),
    ["7_46"],
  );
  const z11 = tierFor(11)!;
  // lon cells 31..32 and lat cells 186..187
  assert.equal(
    cellsFor({ minLon: 7.8, minLat: 46.6, maxLon: 8.2, maxLat: 46.8 }, z11)
      .length,
    4,
  );
});

const line = (uid: string, coordinates: number[][]): ObstacleFeature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates },
  properties: { _uid: uid, obstacleType: "CABLE_CAR", maxHeightAgl: 100 },
});

test("a feature is written to every cell its bbox touches", () => {
  const z11 = tierFor(11)!;
  assert.deepEqual(
    cellsOf(
      line("x", [
        [7.9, 46.7],
        [8.1, 46.7],
      ]),
      z11,
    ),
    ["31_186", "32_186"],
  );
  assert.deepEqual(
    cellsOf(
      line("y", [
        [7.9, 46.7],
        [7.95, 46.72],
      ]),
      z11,
    ),
    ["31_186"],
  );
});

test("a feature in two cells comes back once, cut to the view, from indexed cells only", async () => {
  const across = line("across", [
    [7.9, 46.7],
    [8.1, 46.7],
  ]);
  const far = line("far", [
    [7.3, 46.3],
    [7.31, 46.31],
  ]);
  const files: Record<string, unknown> = {
    "z11/31_186.json": { type: "FeatureCollection", features: [across, far] },
    "z11/32_186.json": { parts: ["32_186.0"] },
    "z11/32_186.0.json": { type: "FeatureCollection", features: [across] },
  };
  const asked: string[] = [];
  const fetchJson = async (path: string) => {
    asked.push(path);
    if (!(path in files)) throw new Error(`404 ${path}`);
    return files[path];
  };
  const index: ShardIndex = {
    generatedAt: "",
    tiers: { z11: ["31_186", "32_186"] },
  };
  const got = await loadObstacles(
    { minLon: 7.95, minLat: 46.6, maxLon: 8.05, maxLat: 46.8 },
    11.4,
    index,
    fetchJson,
  );
  assert.deepEqual(
    got.map((f) => f.properties._uid),
    ["across"],
  );
  assert.deepEqual(asked.sort(), [
    "z11/31_186.json",
    "z11/32_186.0.json",
    "z11/32_186.json",
  ]);
  assert.deepEqual(
    await loadObstacles(
      { minLon: 8, minLat: 46, maxLon: 9, maxLat: 47 },
      6,
      index,
      fetchJson,
    ),
    [],
  );
});

test("a cell that fails counts as empty", async () => {
  const index: ShardIndex = { generatedAt: "", tiers: { z13: ["32_186"] } };
  const original = console.error;
  console.error = () => {};
  try {
    const got = await loadObstacles(
      { minLon: 8, minLat: 46.5, maxLon: 8.1, maxLat: 46.6 },
      13,
      index,
      async () => {
        throw new Error("500");
      },
    );
    assert.deepEqual(got, []);
  } finally {
    console.error = original;
  }
});

test("a quarter's box comes from its name", () => {
  const z10 = tierFor(10)!;
  assert.deepEqual(partBox("16_94", z10), {
    minLon: 8,
    minLat: 47,
    maxLon: 8.5,
    maxLat: 47.5,
  });
  assert.deepEqual(partBox("16_94.1", z10), {
    minLon: 8.25,
    minLat: 47,
    maxLon: 8.5,
    maxLat: 47.25,
  });
  assert.deepEqual(partBox("16_94.2.3", z10), {
    minLon: 8.125,
    minLat: 47.375,
    maxLon: 8.25,
    maxLat: 47.5,
  });
});

test("a split cell loads only the quarters the view touches", async () => {
  const sw = line("sw", [
    [8.1, 47.1],
    [8.11, 47.11],
  ]);
  const files: Record<string, unknown> = {
    "z10/16_94.json": { parts: ["16_94.0", "16_94.1", "16_94.2", "16_94.3"] },
    "z10/16_94.0.json": { type: "FeatureCollection", features: [sw] },
  };
  const asked: string[] = [];
  const fetchJson = async (path: string) => {
    asked.push(path);
    if (!(path in files)) throw new Error(`404 ${path}`);
    return files[path];
  };
  const index: ShardIndex = { generatedAt: "", tiers: { z10: ["16_94"] } };
  const got = await loadObstacles(
    { minLon: 8.05, minLat: 47.05, maxLon: 8.2, maxLat: 47.2 },
    10,
    index,
    fetchJson,
  );
  assert.deepEqual(
    got.map((f) => f.properties._uid),
    ["sw"],
  );
  assert.deepEqual(asked, ["z10/16_94.json", "z10/16_94.0.json"]);
});

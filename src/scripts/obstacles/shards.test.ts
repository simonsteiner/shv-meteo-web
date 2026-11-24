import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObstacleFeature } from "../types.ts";
import { partBox, type Tier } from "./cells.ts";
import { buildShards } from "./shards.ts";

const z13: Tier = { name: "z13", zoom: 13, size: 0.25 };

function marked(id: number, lon: number, lat: number): ObstacleFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { sourceId: `m${id}`, marking: "MARKED", maxHeightAgl: 50 },
  };
}

function build(features: ObstacleFeature[], maxBytes?: number) {
  const written = new Map<string, unknown>();
  const quiet = console.log;
  console.log = () => {};
  try {
    const stats = buildShards(
      features,
      [z13],
      (path, json) => written.set(path, JSON.parse(json)),
      { maxBytes, now: new Date("2026-11-23T00:00:00Z") },
    );
    return { ...stats, written };
  } finally {
    console.log = quiet;
  }
}

test("only cells that hold a feature are written and indexed", () => {
  const { index, written, files } = build([
    marked(1, 7.1, 46.1),
    marked(2, 8.6, 47.3),
  ]);
  const cells = index.tiers.z13;
  assert.equal(cells.length, 2);
  assert.deepEqual(
    [...written.keys()].sort(),
    cells.map((c) => `z13/${c}.json`).sort(),
  );
  assert.equal(files, 2);
  assert.equal(index.generatedAt, "2026-11-23T00:00:00.000Z");
});

test("a cell over the limit is split into named quarters its file lists", () => {
  // two features in opposite corners of one 0.25 degree cell
  const { index, written } = build(
    [marked(1, 7.01, 46.01), marked(2, 7.24, 46.24)],
    300,
  );
  const [cell] = index.tiers.z13;
  assert.deepEqual(written.get(`z13/${cell}.json`), {
    parts: [`${cell}.0`, `${cell}.3`],
  });
  for (const part of [`${cell}.0`, `${cell}.3`]) {
    const shard = written.get(`z13/${part}.json`) as {
      features: ObstacleFeature[];
    };
    assert.equal(shard.features.length, 1);
  }
  assert.equal(written.size, 3);
});

test("no features writes no cells", () => {
  const { index, written } = build([]);
  assert.deepEqual(index.tiers, { z13: [] });
  assert.equal(written.size, 0);
});

test("each quarter's features lie in the box its name gives (cells.ts partBox)", () => {
  // one point per corner of cell 28_184 (7.0..7.25, 46.0..46.25), forced
  // to split by a tiny byte limit
  const corners = [
    marked(1, 7.05, 46.05),
    marked(2, 7.2, 46.05),
    marked(3, 7.05, 46.2),
    marked(4, 7.2, 46.2),
  ];
  const { written } = build(corners, 200);
  const top = written.get("z13/28_184.json") as { parts: string[] };
  assert.equal(top.parts.length, 4);
  const leaves = [...written].filter(
    ([path, file]) =>
      path !== "z13/28_184.json" && "features" in (file as object),
  );
  assert.ok(leaves.length >= 4);
  for (const [path, file] of leaves) {
    const name = path.slice("z13/".length, -".json".length);
    const box = partBox(name, z13);
    for (const f of (file as { features: ObstacleFeature[] }).features) {
      const [lon, lat] = f.geometry.coordinates as number[];
      assert.ok(
        lon >= box.minLon &&
          lon <= box.maxLon &&
          lat >= box.minLat &&
          lat <= box.maxLat,
        `${f.properties.sourceId} outside ${name}`,
      );
    }
  }
});

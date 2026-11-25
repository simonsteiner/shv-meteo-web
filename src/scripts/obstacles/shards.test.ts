import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObstacleFeature } from "../types.ts";
import type { Bbox } from "../types.ts";
import { loadObstacles, partBox, type Tier } from "./cells.ts";
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

function uid(f: ObstacleFeature): ObstacleFeature {
  return { ...f, properties: { ...f.properties, _uid: f.properties.sourceId } };
}

function cable(id: number, coordinates: number[][]): ObstacleFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: { sourceId: `c${id}`, marking: "MARKED", maxHeightAgl: 80 },
  };
}

/** Builds `features` with a limit one feature fits and two do not, then
 * reads `view` back through loadObstacles: the ids it gives, and the
 * files it read. */
async function readBack(features: ObstacleFeature[], view: Bbox) {
  const withUid = features.map(uid);
  const maxBytes = Math.max(
    ...withUid.map(
      (f) =>
        JSON.stringify({ type: "FeatureCollection", features: [f] }).length,
    ),
  );
  const { index, written } = build(withUid, maxBytes);
  const read: string[] = [];
  const got = await loadObstacles(view, 13, index, async (path) => {
    read.push(path);
    if (!written.has(path)) throw new Error(`${path} was not written`);
    return written.get(path);
  });
  return { ids: got.features.map((f) => f.properties.sourceId).sort(), read };
}

test("a line across a quarter's edge comes back from either side alone", async () => {
  // cell 28_184 splits at 7.125 / 46.125; the line crosses 7.125
  const features = [
    cable(1, [
      [7.1, 46.05],
      [7.15, 46.05],
    ]),
    marked(2, 7.2, 46.2),
  ];
  const west = { minLon: 7.01, minLat: 46.01, maxLon: 7.11, maxLat: 46.1 };
  const east = { minLon: 7.14, minLat: 46.01, maxLon: 7.24, maxLat: 46.1 };
  for (const [view, leaf] of [
    [west, "z13/28_184.0.json"],
    [east, "z13/28_184.1.json"],
  ] as const) {
    const { ids, read } = await readBack(features, view);
    assert.deepEqual(ids, ["c1"]);
    assert.deepEqual(read, ["z13/28_184.json", leaf]);
  }
});

test("a line across a depth-2 edge comes back from either side alone", async () => {
  // quarter 28_184.0 (7..7.125, 46..46.125) splits again at 7.0625 /
  // 46.0625; the line crosses 7.0625
  const features = [
    cable(1, [
      [7.05, 46.03],
      [7.075, 46.03],
    ]),
    marked(2, 7.1, 46.1),
    marked(3, 7.2, 46.2),
  ];
  const west = { minLon: 7.01, minLat: 46.01, maxLon: 7.055, maxLat: 46.05 };
  const east = { minLon: 7.065, minLat: 46.01, maxLon: 7.09, maxLat: 46.05 };
  for (const [view, leaf] of [
    [west, "z13/28_184.0.0.json"],
    [east, "z13/28_184.0.1.json"],
  ] as const) {
    const { ids, read } = await readBack(features, view);
    assert.deepEqual(ids, ["c1"]);
    assert.deepEqual(read, ["z13/28_184.json", "z13/28_184.0.json", leaf]);
  }
});

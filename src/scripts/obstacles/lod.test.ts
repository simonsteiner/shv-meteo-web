import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObstacleFeature } from "../types.ts";
import { capFeatures, featureKey, slim, visibleAt } from "./lod.ts";

function obstacle(
  type: string,
  props: ObstacleFeature["properties"] = {},
  coordinates: unknown = [8, 46],
): ObstacleFeature {
  return {
    type: "Feature",
    geometry: { type, coordinates },
    properties: props,
  };
}

/** The first zoom from 6 to 14 at which `f` shows, or null. */
function firstZoom(f: ObstacleFeature): number | null {
  for (let z = 6; z <= 14; z++) if (visibleAt(f, z)) return z;
  return null;
}

test("point symbols need less height as zoom rises", () => {
  const mast = (h: number, small = false) =>
    obstacle("Point", { obstacleType: "POLE", maxHeightAgl: h, small });
  assert.equal(firstZoom(mast(80)), 7);
  assert.equal(firstZoom(mast(79)), 9);
  assert.equal(firstZoom(mast(50)), 9);
  assert.equal(firstZoom(mast(49)), 10);
  assert.equal(firstZoom(mast(30)), 10);
  assert.equal(firstZoom(mast(29)), 11);
  assert.equal(firstZoom(mast(14, true)), 12);
  assert.equal(firstZoom(mast(14)), 11);
  assert.equal(visibleAt(mast(300), 6.9), false);
  assert.equal(visibleAt(mast(80), 8.5), true);
});

test("lines need less height as zoom rises; the overview keeps high-voltage lines", () => {
  const line = (obstacleType: string, h: number, small = false) =>
    obstacle("LineString", { obstacleType, maxHeightAgl: h, small }, [
      [8, 46],
      [8.1, 46.1],
    ]);
  assert.equal(firstZoom(line("TRANSMISSION_LINE", 60)), 7);
  assert.equal(firstZoom(line("CABLE_CAR", 60)), 9);
  assert.equal(firstZoom(line("CABLE_CAR", 35)), 9);
  assert.equal(firstZoom(line("CABLE_CAR", 34)), 10);
  assert.equal(firstZoom(line("CABLE_CAR", 19)), 11);
  assert.equal(firstZoom(line("CATENARY", 9, true)), 12);
  assert.equal(firstZoom(line("CATENARY", 9)), 11);
});

test("marked obstacles show from z7, pylon dots only from z13, polygons always", () => {
  assert.equal(
    firstZoom(
      obstacle("Point", {
        obstacleType: "CRANE",
        marking: "MARKED",
        maxHeightAgl: 5,
      }),
    ),
    7,
  );
  assert.equal(
    firstZoom(
      obstacle("LineString", { obstacleType: "CABLE_CAR", marking: "MARKED" }),
    ),
    7,
  );
  assert.equal(
    firstZoom(
      obstacle("Point", {
        obstacleType: "CABLE_CAR",
        marking: "MARKED",
        maxHeightAgl: 200,
      }),
    ),
    13,
  );
  assert.equal(firstZoom(obstacle("Polygon", {})), 7);
  assert.equal(
    firstZoom(obstacle("GeometryCollection", { marking: "MARKED" })),
    null,
  );
});

test("the key and the slimmed properties", () => {
  const f = obstacle("LineString", {
    sourceId: "BE1",
    partIndex: 2,
    name: "x",
    effectiveDate: "2025-12-18",
  } as ObstacleFeature["properties"]);
  assert.equal(featureKey(f), "BE1_LineString_2");
  const s = slim(f);
  assert.equal(s.properties._uid, "BE1_LineString_2");
  assert.equal(s.properties.geometryType, "LineString");
  // the sheet shows the date; the UUID name is dropped
  assert.equal(s.properties.effectiveDate, "2025-12-18");
  assert.equal("name" in s.properties, false);
});

test("the cap orders marked, then cable cars, then taller, then key", () => {
  const f = (uid: string, props: ObstacleFeature["properties"]) =>
    obstacle("Point", { ...props, _uid: uid });
  const fs = [
    f("e", { maxHeightAgl: 10 }),
    f("d", { maxHeightAgl: 10 }),
    f("c", { maxHeightAgl: 90 }),
    f("b", { obstacleType: "CABLE_CAR", maxHeightAgl: 1 }),
    f("a", { marking: "MARKED", maxHeightAgl: 1 }),
  ];
  assert.deepEqual(
    capFeatures(fs, 4).map((x) => x.properties._uid),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    capFeatures([...fs].reverse(), 4).map((x) => x.properties._uid),
    ["a", "b", "c", "d"],
  );
  assert.equal(capFeatures(fs).length, 5);
});

test("every kind of marking counts as marked, for the zoom and the cap", () => {
  for (const marking of ["CABLE_WARNER", "ORANGE_MARKS", "RED_WHITE_RED"]) {
    const low = obstacle("LineString", { obstacleType: "CABLE_CAR", marking });
    assert.equal(firstZoom(low), 7, marking);
    const mast = obstacle("Point", { obstacleType: "POLE", marking });
    assert.equal(firstZoom(mast), 7, marking);
  }
  const f = (id: string, props: ObstacleFeature["properties"]) =>
    obstacle("Point", { sourceId: id, ...props });
  const kept = capFeatures(
    [
      f("tall", { marking: "NONE", maxHeightAgl: 200 }),
      f("warned", { marking: "CABLE_WARNER", maxHeightAgl: 5 }),
    ],
    1,
  );
  assert.deepEqual(
    kept.map((k) => k.properties.sourceId),
    ["warned"],
  );
});

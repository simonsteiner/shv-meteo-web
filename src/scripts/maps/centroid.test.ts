import assert from "node:assert/strict";
import { test } from "node:test";
import { featureLatLng } from "./centroid.ts";

const at = (type: string, coordinates: unknown) => ({
  geometry: { type, coordinates },
});

test("a point gives itself in lat, lng order", () => {
  assert.deepEqual(featureLatLng(at("Point", [8.2, 46.8])), [46.8, 8.2]);
  assert.deepEqual(featureLatLng(at("Point", [8.2, 46.8, 1200])), [46.8, 8.2]);
});

test("a line gives the mean of its vertices", () => {
  assert.deepEqual(
    featureLatLng(
      at("LineString", [
        [8, 46],
        [10, 48],
      ]),
    ),
    [47, 9],
  );
});

test("a polygon gives the mean of its outer ring, ignoring holes", () => {
  const ring = [
    [8, 46],
    [10, 46],
    [10, 48],
    [8, 48],
  ];
  const hole = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];
  assert.deepEqual(featureLatLng(at("Polygon", [ring, hole])), [47, 9]);
  assert.deepEqual(featureLatLng(at("MultiPolygon", [[ring, hole]])), [47, 9]);
});

test("a multi-line gives the mean of its first line", () => {
  assert.deepEqual(
    featureLatLng(
      at("MultiLineString", [
        [
          [8, 46],
          [10, 46],
        ],
        [
          [20, 20],
          [30, 30],
        ],
      ]),
    ),
    [46, 9],
  );
});

test("invalid vertices are skipped, and nothing valid gives null", () => {
  assert.deepEqual(
    featureLatLng(at("LineString", [[8, 46], ["x", 1], [Number.NaN, 2], null])),
    [46, 8],
  );
  assert.equal(featureLatLng(at("Point", [Number.NaN, 46])), null);
  assert.equal(featureLatLng(at("Point", "8,46")), null);
  assert.equal(featureLatLng(at("Polygon", [])), null);
  assert.equal(featureLatLng(at("GeometryCollection", [])), null);
  assert.equal(featureLatLng({ geometry: null }), null);
  assert.equal(featureLatLng(null), null);
});

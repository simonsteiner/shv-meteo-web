import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_MAPS } from "../settings.ts";
import {
  BASE_LAYERS,
  BASE_MAP_IMAGES,
  DEFAULT_CENTER,
  baseMapKey,
  viewFor,
} from "./basemap.ts";

test("every base map has tiles and a card", () => {
  for (const key of BASE_MAPS) {
    assert.match(BASE_LAYERS[key].url, /^https:\/\/.+\{z\}\/\{x\}\/\{y\}/);
    assert.ok(key in BASE_MAP_IMAGES);
  }
});

test("an unknown base map falls back to the colour pixel map", () => {
  assert.equal(baseMapKey("topoSatellite"), "topoSatellite");
  assert.equal(baseMapKey("google"), "topoColor");
  assert.equal(baseMapKey(undefined), "topoColor");
});

test("a handed-over selection centres the map, a zoom zooms it", () => {
  assert.deepEqual(viewFor([47, 8.5], 13, 9), { center: [47, 8.5], zoom: 13 });
  assert.deepEqual(viewFor([47, 8.5], null, 9), { center: [47, 8.5], zoom: 9 });
  assert.deepEqual(viewFor(null, 11, 9), { center: DEFAULT_CENTER, zoom: 11 });
  assert.equal(viewFor(null, null, 9), null);
});

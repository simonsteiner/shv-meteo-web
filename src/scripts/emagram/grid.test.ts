import assert from "node:assert/strict";
import { test } from "node:test";
import type { GridPoint, PrevitempsGrid } from "../types.ts";
import { gridPoint } from "./grid.ts";

const point = (name: string): GridPoint => ({
  name,
  modelKey: "meteo_swiss:icon_ch1",
  model: "ICON-CH1",
  pointIndex: 1,
  elevation: 500,
  latitude: 46,
  longitude: 8,
});
const grid: PrevitempsGrid = {
  zürich: point("Zürich"),
  "disentis/mustér": point("Disentis/Mustér"),
  interlaken: point("Interlaken"),
};

test("names match case-insensitively, umlauts and slashes included", () => {
  assert.equal(gridPoint("Zürich", grid)?.name, "Zürich");
  assert.equal(gridPoint("ZÜRICH", grid)?.name, "Zürich");
  assert.equal(gridPoint("Disentis/Mustér", grid)?.name, "Disentis/Mustér");
  assert.equal(gridPoint("interlaken", grid)?.name, "Interlaken");
});

test("an unknown name gives null", () => {
  assert.equal(gridPoint("Atlantis", grid), null);
  assert.equal(gridPoint("toString", grid), null);
  assert.equal(gridPoint("", grid), null);
});

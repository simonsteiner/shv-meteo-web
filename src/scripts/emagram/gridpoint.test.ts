import assert from "node:assert/strict";
import { test } from "node:test";
import { nearestGridPoint, tileIndex } from "./gridpoint.ts";

const station = { name: "Interlaken", lat: 46.686, lon: 7.863, elevation: 568 };
const pt = (pointIndex: number, latitude: number, longitude: number) => ({
  pointIndex,
  coordinate: { latitude, longitude, elevation: 600 },
});

test("the tile index of the official app's zoom-10 grid", () => {
  assert.deepEqual(tileIndex(46.686, 7.863), { x: 534, y: 246 });
});

test("ICON-CH1 before ICON-CH2, and the nearest point", () => {
  const tile = {
    definitions: [
      {
        products: [{ identifier: "meteo_swiss:icon_ch2" }],
        gridPoints: [pt(9, 46.686, 7.863)],
      },
      {
        products: [{ identifier: "dwd:icon_d2" }],
        gridPoints: [pt(8, 46.686, 7.863)],
      },
      {
        products: [
          { identifier: "meteo_swiss:icon_ch1" },
          { identifier: "meteo_swiss:icon_ch1_10min" },
        ],
        gridPoints: [pt(1, 46.7, 7.9), pt(2, 46.69, 7.86), pt(3, 46.6, 7.8)],
      },
    ],
  };
  const p = nearestGridPoint(tile, station);
  assert.equal(p.modelKey, "meteo_swiss:icon_ch1");
  assert.equal(p.model, "ICON-CH1");
  assert.equal(p.pointIndex, 2);
  assert.equal(p.name, "Interlaken");
});

test("ICON-CH2 where the tile has no ICON-CH1 points", () => {
  const tile = {
    definitions: [
      { products: [{ identifier: "meteo_swiss:icon_ch1" }], gridPoints: [] },
      {
        products: [{ identifier: "meteo_swiss:icon_ch2" }],
        gridPoints: [pt(9, 46.686, 7.863)],
      },
    ],
  };
  assert.equal(nearestGridPoint(tile, station).model, "ICON-CH2");
});

test("no ICON grid is an error naming the station", () => {
  assert.throws(
    () =>
      nearestGridPoint(
        {
          definitions: [
            {
              products: [{ identifier: "dwd:icon_eu" }],
              gridPoints: [pt(1, 46, 7)],
            },
          ],
        },
        station,
      ),
    /Interlaken/,
  );
  assert.throws(() => nearestGridPoint({}, station), /Interlaken/);
});

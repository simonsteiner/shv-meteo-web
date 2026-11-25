import assert from "node:assert/strict";
import { test } from "node:test";
import { nearestGridPoint, tileIndex, tileUrlsNear } from "./gridpoint.ts";

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
  const p = nearestGridPoint([tile], station);
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
  assert.equal(nearestGridPoint([tile], station).model, "ICON-CH2");
});

test("no ICON grid is an error naming the station", () => {
  assert.throws(
    () =>
      nearestGridPoint(
        [
          {
            definitions: [
              {
                products: [{ identifier: "dwd:icon_eu" }],
                gridPoints: [pt(1, 46, 7)],
              },
            ],
          },
        ],
        station,
      ),
    /Interlaken/,
  );
  assert.throws(() => nearestGridPoint([{}], station), /Interlaken/);
});

test("a misshapen tile is an error naming the station", () => {
  const ch1 = [{ identifier: "meteo_swiss:icon_ch1" }];
  assert.throws(
    () => nearestGridPoint([{ definitions: [null] }], station),
    /Interlaken has a definition that is not an object/,
  );
  assert.throws(
    () =>
      nearestGridPoint(
        [{ definitions: [{ products: ch1, gridPoints: [{ pointIndex: 1 }] }] }],
        station,
      ),
    /Interlaken has a grid point without pointIndex/,
  );
});

const ch1Tile = (...points: ReturnType<typeof pt>[]) => ({
  definitions: [
    { products: [{ identifier: "meteo_swiss:icon_ch1" }], gridPoints: points },
  ],
});

test("the nearest point in kilometres, not in raw degrees", () => {
  // 0.004° north is 0.44 km; 0.0045° east at 46.7° N is only 0.34 km
  const north = pt(1, station.lat + 0.004, station.lon);
  const east = pt(2, station.lat, station.lon + 0.0045);
  assert.equal(nearestGridPoint([ch1Tile(north, east)], station).pointIndex, 2);
});

test("a point in the neighbouring tile wins when it is nearer", () => {
  const own = ch1Tile(pt(1, station.lat + 0.01, station.lon));
  const next = ch1Tile(pt(2, station.lat, station.lon + 0.001));
  assert.equal(nearestGridPoint([own, next], station).pointIndex, 2);
});

test("a station near a tile's edge also reads the tile beyond it", () => {
  // tile x 534 spans 7.734375 to 8.0859375 degrees east
  const urls = tileUrlsNear(46.686, 8.084);
  assert.ok(
    urls.includes(
      "https://static-prod.ubmeteo.io/v1/products/grid/10/534/246.json",
    ),
  );
  assert.ok(
    urls.includes(
      "https://static-prod.ubmeteo.io/v1/products/grid/10/535/246.json",
    ),
  );
  assert.deepEqual(tileUrlsNear(46.686, 7.9), [
    "https://static-prod.ubmeteo.io/v1/products/grid/10/534/246.json",
  ]);
});

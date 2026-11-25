import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationPair } from "../foehn/report.ts";
import { pairPillsHtml, stationCardHtml, webcamCardHtml } from "./cards.ts";
import { filterWebcams, webcamImages } from "./webcams.ts";

const text = {
  wind: "Wind",
  gust: "Böe",
  temp: "Temp",
  windDirection: "Windrichtung",
};
const evil = `<img src=x onerror="alert(1)">`;

test("stationCardHtml escapes upstream names and ids", () => {
  const html = stationCardHtml(
    {
      id: `x:"><script>`,
      geometry: { type: "Point", coordinates: [8, 47] },
      properties: { name: evil, providerKey: "<b>", windSpeedValue: 31.4 },
    },
    text,
  );
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<B>"));
  assert.ok(html.includes("text-danger"));
  assert.ok(html.includes("31 km/h"));
});

test("stationCardHtml labels station pressure QFE, never QNH", () => {
  const card = (properties: Record<string, number>) =>
    stationCardHtml(
      {
        id: "slf:X",
        geometry: { type: "Point", coordinates: [8, 47] },
        properties,
      },
      text,
    );
  const qfe = card({ pressureSurfaceValue: 850.4 });
  assert.ok(qfe.includes(">QFE<"));
  assert.ok(!qfe.includes("QNH"));
  assert.ok(qfe.includes(">850<"));
  const qnh = card({ pressureMslValue: 1021.2, pressureSurfaceValue: 850.4 });
  assert.ok(qnh.includes(">QNH<"));
  assert.ok(qnh.includes(">1021<"));
});

test("the card's arrow points downwind, as on the map, and is left out without a direction", () => {
  const card = (properties: Record<string, number>) =>
    stationCardHtml(
      {
        id: "meteo_swiss:PIL",
        geometry: { type: "Point", coordinates: [8, 47] },
        properties,
      },
      text,
    );
  // a north wind blows south
  const north = card({ windSpeedValue: 20, windDirectionValue: 0 });
  assert.ok(north.includes("rotate(180deg)"));
  assert.ok(north.includes("Windrichtung 0°"));
  const none = card({ windSpeedValue: 20 });
  assert.ok(!none.includes("st-card-arrow"));
  assert.ok(!none.includes("rotate("));
});

test("the cards hide an altitude of 0", () => {
  const st = stationCardHtml(
    {
      id: "slf:X",
      geometry: { type: "Point", coordinates: [8, 47] },
      properties: { altitude: 0, providerKey: "slf" },
    },
    text,
  );
  assert.ok(!st.includes("0m"));
  const cam = (altitudeM: number) =>
    webcamCardHtml({
      identifier: "cam:1",
      name: "Cam",
      latitude: 46,
      longitude: 8,
      altitudeM,
    });
  assert.ok(!cam(0).includes("0m"));
  assert.ok(cam(1450).includes("1450m"));
});

test("webcamCardHtml escapes text and refuses non-http image URLs", () => {
  const html = webcamCardHtml({
    identifier: "cam:1",
    name: evil,
    latitude: 46,
    longitude: 8,
    thumbnailUrl: "javascript:alert(1)",
    latestImageUrl: "https://cams.example/latest.jpg",
  });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes('src="https://cams.example/latest.jpg"'));
  assert.ok(!html.includes("data-fallback"));
});

test("webcamImages falls back from the thumbnail to the latest image", () => {
  assert.deepEqual(
    webcamImages({
      identifier: "c",
      name: "c",
      latitude: 0,
      longitude: 0,
      thumbnailUrl: "https://a.example/t.jpg",
      latestImageUrl: "https://a.example/l.jpg",
    }),
    { src: "https://a.example/t.jpg", fallback: "https://a.example/l.jpg" },
  );
});

test("filterWebcams searches name and location", () => {
  const cams = [
    {
      identifier: "a",
      name: "Niesen",
      latitude: 0,
      longitude: 0,
      location: "Frutigen",
    },
    { identifier: "b", name: "Brunni", latitude: 0, longitude: 0 },
  ];
  assert.deepEqual(
    filterWebcams(cams, "frut").map((c) => c.identifier),
    ["a"],
  );
  assert.equal(filterWebcams(cams, "").length, 2);
});

test("pairPillsHtml marks the selected pair", () => {
  const pair = {
    id: "KLO_LUG",
    delta: -4.7,
    unit: "hPa",
    alertLevel: "MODERATE",
  } as StationPair;
  const html = pairPillsHtml(
    [pair, { ...pair, id: "GVE_GUT", delta: 1 }],
    "KLO_LUG",
  );
  assert.ok(
    html.includes('data-pair-id="KLO_LUG" class="pair-pill-btn active"'),
  );
  assert.ok(html.includes("-4.7 hPa"));
  assert.ok(html.includes("+1 hPa"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { MeasurementFeature } from "../types.ts";
import {
  providerLabel,
  signedDegrees,
  stationLatLng,
  stationMarker,
  stationMeasurements,
  temperatureColor,
  windColor,
} from "./stations.ts";

function station(props: Record<string, unknown>): MeasurementFeature {
  return {
    id: "meteo_swiss:PIL",
    geometry: { type: "Point", coordinates: [8.25, 46.98] },
    properties: { name: "Pilatus", providerKey: "meteo_swiss", ...props },
  };
}

test("windColor follows the buckets, upper bound exclusive", () => {
  assert.equal(windColor(0), "#FFFFFF");
  assert.equal(windColor(2.9), "#FFFFFF");
  assert.equal(windColor(3), "#D2FFFE");
  assert.equal(windColor(24), "#F5DA01");
  assert.equal(windColor(99), "#8301B2");
  assert.equal(windColor(100), "#550273");
});

test("temperatureColor steps at 0, 8, 15 and 22 °C", () => {
  assert.equal(temperatureColor(-0.1), "#3B82F6");
  assert.equal(temperatureColor(0), "#06B6D4");
  assert.equal(temperatureColor(8), "#10B981");
  assert.equal(temperatureColor(15), "#F59E0B");
  assert.equal(temperatureColor(22), "#EF4444");
});

test("measurements convert Kelvin and keep hPa and km/h", () => {
  const r = stationMeasurements(
    station({
      windSpeedValue: 18.26,
      windGustValue: 30,
      windDirectionValue: 270,
      temperature2mValue: 278.15,
      pressureStandardMslValue: 1013.2,
    }),
  );
  assert.deepEqual(r, {
    windKmh: 18.3,
    gustKmh: 30,
    dirDeg: 270,
    tempC: 5,
    qnhHpa: 1013,
  });
  const celsius = stationMeasurements(station({ temperatureValue: -3.44 }));
  assert.equal(celsius.tempC, -3.4);
  assert.equal(celsius.windKmh, null);
  assert.equal(celsius.qnhHpa, null);
});

test("a station position is lat, lng, or null when invalid", () => {
  assert.deepEqual(stationLatLng(station({})), [46.98, 8.25]);
  const bad = station({});
  bad.geometry.coordinates = [Number.NaN, 46];
  assert.equal(stationLatLng(bad), null);
});

test("signedDegrees adds a plus above zero", () => {
  assert.equal(signedDegrees(5.2), "+5.2°");
  assert.equal(signedDegrees(0), "0°");
  assert.equal(signedDegrees(-1), "-1°");
});

test("the wind marker is an arrow turned to the direction, a dot when calm", () => {
  const arrow = stationMarker(
    station({ windSpeedValue: 24.4, windDirectionValue: 200.4 }),
    "WIND",
  );
  assert.ok(arrow?.html.includes("rotate(200deg)"));
  assert.ok(arrow?.html.includes("#F5DA01"));
  assert.ok(arrow?.html.includes("Pilatus: 24 km/h (200°)"));
  const calm = stationMarker(station({ windSpeedValue: 2 }), "WIND");
  assert.ok(calm?.html.includes("wind-dot-svg"));
  assert.equal(stationMarker(station({ windSpeedValue: 10 }), "WIND"), null);
  assert.equal(stationMarker(station({}), "WIND"), null);
});

test("the temperature marker shows the converted value", () => {
  const pin = stationMarker(
    station({ temperature2mValue: 290.15 }),
    "TEMPERATURE",
  );
  assert.ok(pin?.html.includes("+17°"));
  assert.ok(pin?.html.includes("#F59E0B"));
  assert.equal(stationMarker(station({}), "TEMPERATURE"), null);
});

test("a station name lands in the marker as text", () => {
  const html = stationMarker(
    station({ name: '"><img src=x onerror=alert(1)>', temperature2mValue: 3 }),
    "TEMPERATURE",
  )?.html;
  assert.ok(html && !html.includes("<img"), html);
});

test("providerLabel names known providers and capitalises others", () => {
  assert.equal(providerLabel(station({})), "MeteoSchweiz (CH)");
  assert.equal(providerLabel(station({ providerKey: "acme" })), "ACME");
  assert.equal(providerLabel(station({ providerKey: "toString" })), "TOSTRING");
  assert.equal(providerLabel(station({ providerKey: "" })), null);
});

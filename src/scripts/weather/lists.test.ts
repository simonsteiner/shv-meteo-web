import assert from "node:assert/strict";
import { test } from "node:test";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { MAX_STATIONS, listView, type ListInput } from "./lists.ts";

function station(i: number, providerKey: string): MeasurementFeature {
  return {
    id: `${providerKey}:${i}`,
    geometry: { type: "Point", coordinates: [8, 47] },
    properties: { name: `Station ${i}`, providerKey },
  };
}

const stations = [
  ...Array.from({ length: 60 }, (_, i) => station(i, "meteo_swiss")),
  ...Array.from({ length: 5 }, (_, i) => station(100 + i, "holfuy")),
];
const webcams = [{ identifier: "a:b", name: "Bielen" } as Webcam];
const base: ListInput = {
  tab: "stations",
  stations,
  webcams,
  provider: "ALL",
  search: "",
};

test("the all pill counts every provider while one is picked", () => {
  const view = listView({ ...base, provider: "holfuy" });
  assert.equal(view.counts.stations, 5);
  assert.equal(view.counts.allProviders, 65);
  assert.equal(view.counts.webcams, 1);
});

test("the search narrows every count", () => {
  const view = listView({ ...base, provider: "holfuy", search: "station 10" });
  // "Station 10" and "Station 100" to "Station 104"
  assert.equal(view.counts.stations, 5);
  assert.equal(view.counts.allProviders, 6);
});

test("the cards show the first matches and say how many there are", () => {
  const view = listView(base);
  assert.equal(view.stations.length, MAX_STATIONS);
  assert.equal(view.matches, 65);
  assert.equal(view.shown, MAX_STATIONS);
  assert.equal(view.statusKey, null);
  const cams = listView({ ...base, tab: "webcams" });
  assert.equal(cams.matches, 1);
  assert.equal(cams.shown, 1);
});

test("the status line says loading, unavailable or no matches", () => {
  assert.equal(
    listView({ ...base, stations: undefined }).statusKey,
    "weather.loading",
  );
  assert.equal(
    listView({ ...base, stations: null }).statusKey,
    "weather.stationsUnavailable",
  );
  assert.equal(
    listView({ ...base, tab: "webcams", webcams: null }).statusKey,
    "weather.webcamsUnavailable",
  );
  assert.equal(
    listView({ ...base, search: "nowhere" }).statusKey,
    "weather.noMatches",
  );
  // the other tab's failure doesn't show on this one
  assert.equal(listView({ ...base, webcams: null }).statusKey, null);
});

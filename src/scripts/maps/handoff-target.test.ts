import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { defaultSettings } from "../settings.ts";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  Webcam,
} from "../types.ts";
import { findHandoff, revealFor } from "./handoff-target.ts";

const launch: FlyingSiteFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [8.5, 47] },
  properties: { siteId: "a", siteName: "Alp Schwand", type: "launch" },
};
const station = {
  type: "Feature",
  id: "meteo_swiss:KLO",
  geometry: { type: "Point", coordinates: [8.54, 47.48] },
  properties: { name: "Kloten" },
} as unknown as MeasurementFeature;
const webcam = {
  identifier: "meteo_swiss:DOL",
  name: "La Dôle",
  latitude: 46.42,
  longitude: 6.1,
} as Webcam;

function quiet(t: TestContext) {
  return t.mock.method(console, "error", () => {});
}

test("a handed-over site, station or webcam is selected where it is", () => {
  assert.deepEqual(
    findHandoff({ site: "a" }, { kind: "site", items: [launch] }),
    { selection: { kind: "site", value: launch }, at: [47, 8.5] },
  );
  assert.deepEqual(
    findHandoff(
      { station: "meteo_swiss:KLO" },
      { kind: "station", items: [station] },
    ),
    { selection: { kind: "station", value: station }, at: [47.48, 8.54] },
  );
  assert.deepEqual(
    findHandoff(
      { webcam: "meteo_swiss:DOL" },
      { kind: "webcam", items: [webcam] },
    ),
    { selection: { kind: "webcam", value: webcam }, at: [46.42, 6.1] },
  );
});

test("a handoff of another kind, or none, ignores the data set", (t) => {
  const error = quiet(t);
  assert.equal(
    findHandoff({ webcam: "meteo_swiss:DOL" }, { kind: "site", items: [] }),
    null,
  );
  assert.equal(
    findHandoff({ locate: true }, { kind: "station", items: [] }),
    null,
  );
  assert.equal(findHandoff(null, { kind: "webcam", items: [webcam] }), null);
  assert.equal(error.mock.callCount(), 0);
});

test("a handed-over id the data lacks is logged, not selected", (t) => {
  const error = quiet(t);
  assert.equal(
    findHandoff(
      { station: "meteo_swiss:XXX" },
      { kind: "station", items: [station] },
    ),
    null,
  );
  assert.equal(error.mock.callCount(), 1);
  assert.match(String(error.mock.calls[0].arguments[0]), /\[maps\.handoff\]/);
});

test("a hidden station or webcam layer is turned on through its meteo mode", () => {
  const state = defaultSettings();
  assert.deepEqual(revealFor("station", state), {
    meteoMode: null,
    layers: [],
  });
  assert.deepEqual(revealFor("webcam", state), {
    meteoMode: "WEBCAM",
    layers: [],
  });
  const hidden = { ...state, layers: { ...state.layers, stations: false } };
  assert.deepEqual(revealFor("station", hidden).meteoMode, "WIND");
  assert.deepEqual(
    revealFor("station", { ...hidden, meteoMode: "TEMPERATURE" }).meteoMode,
    "TEMPERATURE",
  );
});

test("a handed-over site turns on the take-offs and landings it lacks", () => {
  const state = defaultSettings();
  assert.deepEqual(revealFor("site", state), {
    meteoMode: null,
    layers: ["launches", "landings"],
  });
  const shown = { ...state, layers: { ...state.layers, launches: true } };
  assert.deepEqual(revealFor("site", shown).layers, ["landings"]);
  assert.deepEqual(revealFor("obstacle", state), {
    meteoMode: null,
    layers: [],
  });
});

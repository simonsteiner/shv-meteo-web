import assert from "node:assert/strict";
import { test } from "node:test";
import { dictionaryFor } from "../i18n/dictionaries.ts";
import { say as sayIn } from "../i18n/text.ts";
import { LANGS, defaultSettings } from "../settings.ts";
import type { Selection } from "../sheet/render.ts";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  Webcam,
} from "../types.ts";
import { createMapSession, DATASETS } from "./session.ts";

const state = {
  ...defaultSettings(),
  searchQuery: "",
  pilotLocation: null,
  pilotFix: 0,
};
const site = { type: "Feature" } as FlyingSiteFeature;
const selected: Selection = { kind: "site", value: site };
const station = {
  id: "meteo_swiss:KLO",
  geometry: { coordinates: [8.5, 47.4] },
} as unknown as MeasurementFeature;
const webcam = { identifier: "w1", latitude: 46, longitude: 7 } as Webcam;

const plainSay = (key: string) =>
  key === "map.loadFailed" ? "Not loaded: {names}" : key.slice(12);

function session(
  handoff: Parameters<typeof createMapSession>[0]["handoff"] = null,
  zoom: number | null = null,
  say = plainSay,
) {
  return createMapSession({ handoff, zoom, say });
}

const none = () => undefined;

test("the first render draws the words, sites, stations and sheet", () => {
  assert.deepEqual(session().plan(state, null).redraw, {
    text: true,
    sites: true,
    stations: true,
    obstacles: null,
    sheet: true,
  });
});

test("an unchanged state redraws nothing", () => {
  const s = session();
  s.plan(state, selected);
  assert.deepEqual(s.plan(state, selected).redraw, {
    text: false,
    sites: false,
    stations: false,
    obstacles: null,
    sheet: false,
  });
});

test("a language switch redraws the words, sites and sheet", () => {
  const s = session();
  s.plan(state, null);
  const { redraw } = s.plan({ ...state, lang: "fr" }, null);
  assert.equal(redraw.text, true);
  assert.equal(redraw.sites, true);
  assert.equal(redraw.sheet, true);
  assert.equal(redraw.stations, false);
});

test("a search or wind filter redraws the sites only", () => {
  const s = session();
  s.plan(state, null);
  const { redraw } = s.plan({ ...state, windFilter: ["N"] }, null);
  assert.equal(redraw.sites, true);
  assert.equal(redraw.text, false);
  assert.equal(redraw.sheet, false);
});

test("settled sites force one sites redraw, other data sets do not", () => {
  const s = session();
  s.plan(state, null);
  s.settle("airspaces", {}, "x", none);
  assert.equal(s.plan(state, null).redraw.sites, false);
  s.settle("sites", {}, "x", none);
  assert.equal(s.plan(state, null).redraw.sites, true);
  assert.equal(s.plan(state, null).redraw.sites, false);
});

test("stations redraw on a mode switch and when shown again", () => {
  const s = session();
  s.plan(state, null);
  assert.equal(
    s.plan({ ...state, meteoMode: "TEMPERATURE" }, null).redraw.stations,
    true,
  );
  const hidden = { ...state, layers: { ...state.layers, stations: false } };
  assert.equal(s.plan(hidden, null).redraw.stations, false);
  assert.equal(s.plan(state, null).redraw.stations, true);
});

test("obstacles load when shown and clear when hidden", () => {
  const s = session();
  s.plan(state, null);
  const shown = { ...state, layers: { ...state.layers, obstacles: true } };
  assert.equal(s.plan(shown, null).redraw.obstacles, "load");
  assert.equal(s.plan(shown, null).redraw.obstacles, null);
  assert.equal(s.plan(state, null).redraw.obstacles, "clear");
});

test("a new selection or a cleared one redraws the sheet", () => {
  const s = session();
  s.plan(state, null);
  assert.equal(s.plan(state, selected).redraw.sheet, true);
  assert.equal(s.plan(state, null).redraw.sheet, true);
});

test("a null answer fails the data set, said while its layer is shown", () => {
  const s = session();
  s.settle("webcams", null, "x", none);
  s.settle("measurements", null, "x", none);
  assert.equal(s.plan(state, null).status, "Not loaded: measurements");
  const webcams = { ...state, layers: { ...state.layers, webcams: true } };
  assert.equal(
    s.plan(webcams, null).status,
    "Not loaded: measurements, webcams",
  );
});

test("a throw while drawing fails the data set and is logged", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const s = session();
  const target = s.settle("foehn", {}, "[maps] label:", () => {
    throw new Error("boom");
  });
  assert.equal(target, null);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], "[maps] label:");
  const foehn = { ...state, layers: { ...state.layers, foehnAxis: true } };
  assert.equal(s.plan(foehn, null).status, "Not loaded: foehn");
});

test("the flying sites count for any of their three layers", () => {
  const s = session();
  s.settle("sites", null, "x", none);
  const off = { ...state.layers, launches: false, landings: false };
  assert.equal(s.plan({ ...state, layers: off }, null).status, "");
  const circuits = { ...off, landingPatterns: true };
  assert.equal(
    s.plan({ ...state, layers: circuits }, null).status,
    "Not loaded: sites",
  );
});

test("the status line names the failed data sets in every language", () => {
  for (const lang of LANGS) {
    const say = (key: string) => {
      const text = sayIn(dictionaryFor(lang), key);
      assert.notEqual(text, "", `${lang}: ${key}`);
      return text;
    };
    const s = session(null, null, say);
    for (const d of DATASETS) s.settle(d, null, "x", none);
    s.obstacles(true);
    const everything = Object.fromEntries(
      Object.keys(state.layers).map((k) => [k, true]),
    ) as unknown as typeof state.layers;
    const line = s.plan({ ...state, layers: everything }, null).status;
    assert.notEqual(line, "");
    assert.doesNotMatch(line, /\{names\}/);
  }
});

test("failed obstacles count until a load succeeds", () => {
  const s = session();
  const shown = { ...state, layers: { ...state.layers, obstacles: true } };
  assert.equal(s.obstacles(true), true);
  assert.equal(s.obstacles(true), false);
  assert.equal(s.plan(state, null).status, "", "hidden layer, no word");
  assert.equal(s.plan(shown, null).status, "Not loaded: obstacles");
  assert.equal(s.obstacles(false), true);
  assert.equal(s.obstacles(false), false);
  assert.equal(s.plan(shown, null).status, "");
});

test("the handoff is taken once, by its kind", () => {
  const s = session({ station: "meteo_swiss:KLO" });
  assert.equal(
    s.settle("webcams", {}, "x", () => ({ kind: "webcam", items: [webcam] })),
    null,
  );
  const target = s.settle("measurements", {}, "x", () => ({
    kind: "station",
    items: [station],
  }));
  assert.equal(target?.selection.value, station);
  assert.deepEqual(target?.at, [47.4, 8.5]);
  assert.equal(
    s.settle("measurements", {}, "x", () => ({
      kind: "station",
      items: [station],
    })),
    null,
  );
});

test("a stale handoff id is logged and consumes the handoff", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const s = session({ webcam: "gone" });
  const loaded = () => ({ kind: "webcam" as const, items: [webcam] });
  assert.equal(s.settle("webcams", {}, "x", loaded), null);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(s.settle("webcams", {}, "x", loaded), null);
  assert.equal(log.mock.callCount(), 1);
});

test("the pilot centres once per fix, with ?z on the first ?locate fix", () => {
  const s = session({ locate: true }, 14);
  const at = { lat: 47, lng: 8 };
  assert.equal(s.plan(state, null).pilot, null);
  const fixed = { ...state, pilotLocation: at, pilotFix: 1 };
  assert.deepEqual(s.plan(fixed, null).pilot, { at: [47, 8], zoom: 14 });
  assert.equal(s.plan(fixed, null).pilot, null);
  const again = { ...fixed, pilotFix: 2 };
  assert.deepEqual(s.plan(again, null).pilot, { at: [47, 8], zoom: null });
});

test("locateEnded drops ?z, and ?z applies to a ?locate handoff only", () => {
  const at = { lat: 47, lng: 8 };
  const fixed = { ...state, pilotLocation: at, pilotFix: 1 };
  const ended = session({ locate: true }, 14);
  ended.locateEnded();
  assert.equal(ended.plan(fixed, null).pilot?.zoom, null);
  const other = session({ site: "s" }, 14);
  assert.equal(other.plan(fixed, null).pilot?.zoom, null);
});

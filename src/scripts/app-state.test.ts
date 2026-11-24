import assert from "node:assert/strict";
import { test } from "node:test";
import { AppState, isTab } from "./app-state.ts";
import {
  MAP_CATEGORIES,
  METEO_MODES,
  type KeyValueStorage,
  type Layers,
  type MapCategory,
  type MeteoMode,
} from "./settings.ts";

/** A Storage over a Map, as localStorage and sessionStorage behave. */
function memory(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  const storage: KeyValueStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

function make(local: Record<string, string> = {}, view = "map") {
  const l = memory(local);
  const s = memory();
  const visited: string[] = [];
  const store = new AppState({
    local: l.storage,
    session: s.storage,
    view,
    navigate: (path) => void visited.push(path),
  });
  return { store, local: l.map, session: s.map, visited };
}

test("the page's tab comes from data-view, else the map", () => {
  assert.equal(make({}, "safety").store.state.activeTab, "safety");
  assert.equal(make({}, "profile").store.state.activeTab, "map");
  assert.ok(isTab("forecast"));
  assert.ok(!isTab("profile"));
});

test("saved settings load, and setters save them under shv_* keys", () => {
  const { store, local } = make({ shv_lang: "fr", shv_theme: "light" });
  assert.equal(store.state.lang, "fr");
  assert.equal(store.t.tabs.map, "Carte Live");
  store.setLang("it");
  store.setTheme("dark");
  assert.equal(local.get("shv_lang"), "it");
  assert.equal(local.get("shv_theme"), "dark");
});

test("subscribers hear every change; a throwing one doesn't stop the rest", () => {
  const { store } = make();
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  let heard = 0;
  store.subscribe(() => {
    throw new Error("boom");
  });
  const stop = store.subscribe(() => void heard++);
  try {
    store.setSearchQuery("Niesen");
    stop();
    store.setSearchQuery("");
  } finally {
    console.error = original;
  }
  assert.equal(heard, 1);
  assert.equal(errors.length, 2);
});

// The layers the old if chains in src/state.js set, per category and mode.
const CATEGORY_SHOWS: Record<MapCategory, (keyof Layers)[]> = {
  METEO: ["stations"],
  AIRSPACE: ["airspace", "wildschutz"],
  FLYING_AREAS: ["launches", "landings", "landingPatterns"],
};
const MODE_SHOWS: Record<MeteoMode, (keyof Layers)[]> = {
  WIND: ["stations"],
  TEMPERATURE: ["stations"],
  PRESSURE_DIFFERENCE: ["foehnAxis"],
  WEBCAM: ["webcams"],
  NONE: [],
};
const MODE_SWITCHES: (keyof Layers)[] = ["stations", "webcams", "foehnAxis"];

/** Every layer set to `on`, saved so the store starts from it. */
function allLayers(on: boolean): Record<string, string> {
  const { store } = make();
  const layers = Object.fromEntries(
    Object.keys(store.state.layers).map((k) => [k, on]),
  );
  return { shv_layers: JSON.stringify(layers) };
}

function shown(layers: Layers): string[] {
  return Object.entries(layers)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();
}

test("the tables below cover every map category and meteo mode", () => {
  assert.deepEqual(
    Object.keys(CATEGORY_SHOWS).sort(),
    [...MAP_CATEGORIES].sort(),
  );
  assert.deepEqual(Object.keys(MODE_SHOWS).sort(), [...METEO_MODES].sort());
});

for (const category of MAP_CATEGORIES)
  for (const before of [true, false])
    test(`${category} shows its layers and hides the rest (all ${before ? "on" : "off"} before)`, () => {
      const { store, local } = make(allLayers(before));
      store.setMapCategory(category);
      const want = [...CATEGORY_SHOWS[category]].sort();
      assert.deepEqual(shown(store.state.layers), want);
      assert.equal(local.get("shv_mapCategory"), category);
      assert.deepEqual(
        shown(JSON.parse(local.get("shv_layers") ?? "{}")),
        want,
      );
    });

for (const mode of METEO_MODES)
  for (const before of [true, false])
    test(`${mode} switches only the live-weather layers (all ${before ? "on" : "off"} before)`, () => {
      const { store, local } = make(allLayers(before));
      store.setMeteoMode(mode);
      for (const [key, value] of Object.entries(store.state.layers)) {
        const layer = key as keyof Layers;
        const want = MODE_SWITCHES.includes(layer)
          ? MODE_SHOWS[mode].includes(layer)
          : before;
        assert.equal(value, want, `${mode}: ${key}`);
      }
      assert.equal(local.get("shv_meteoMode"), mode);
    });

test("the wind filter toggles a direction and clears", () => {
  const { store, local } = make();
  store.toggleWindFilter("N");
  store.toggleWindFilter("SW");
  store.toggleWindFilter("N");
  assert.deepEqual(store.state.windFilter, ["SW"]);
  assert.equal(local.get("shv_windFilter"), '["SW"]');
  store.clearWindFilter();
  assert.deepEqual(store.state.windFilter, []);
});

test("the map holds one selection at a time", () => {
  const { store } = make();
  store.select("site", { id: 1 });
  store.select("station", { id: 2 });
  assert.equal(store.state.selectedSite, null);
  assert.deepEqual(store.state.selectedStation, { id: 2 });
  store.select(null);
  assert.equal(store.state.selectedStation, null);
});

test("the checklist lives in the session storage", () => {
  const { store, session } = make();
  store.setChecklistPoint("p2", true);
  assert.equal(JSON.parse(session.get("shv_checklist") ?? "{}").p2, true);
  store.checkAllChecklist();
  assert.ok(Object.values(store.state.checklist).every(Boolean));
  store.resetChecklist();
  assert.ok(!Object.values(store.state.checklist).some(Boolean));
});

test("a new flight goes first; the vario rate rounds to 0.1", () => {
  const { store, local } = make({ shv_flights: '[{"id":"a"}]' });
  store.addFlight({ id: "b" });
  assert.deepEqual(JSON.parse(local.get("shv_flights") ?? "[]"), [
    { id: "b" },
    { id: "a" },
  ]);
  store.setVarioRate(2.345);
  assert.equal(store.state.varioRate, 2.3);
  assert.equal(store.state.varioMuted, true);
});

test("switching tabs navigates to the tab's page", () => {
  const { store, visited } = make();
  store.setTab("weather");
  assert.deepEqual(visited, ["/weather/"]);
});

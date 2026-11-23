import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browserStorage,
  defaultSettings,
  loadChecklist,
  loadSettings,
  purgeLegacyAuth,
  saveChecklist,
  saveSetting,
  type KeyValueStorage,
} from "./settings.ts";

/** A Storage over a Map, as localStorage and sessionStorage behave. */
function fakeStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  const storage: KeyValueStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, map };
}

/** Runs `fn` with console.error silenced; returns what it logged. */
function quiet(fn: () => void): unknown[] {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    fn();
  } finally {
    console.error = original;
  }
  return errors;
}

test("an empty storage gives every default", () => {
  assert.deepEqual(loadSettings(fakeStorage().storage), defaultSettings());
});

test("stored values load", () => {
  const { storage } = fakeStorage({
    shv_lang: "fr",
    shv_theme: "light",
    shv_baseMap: "topoOsm",
    shv_mapCategory: "AIRSPACE",
    shv_meteoMode: "WEBCAM",
    shv_windFilter: '["N","SW"]',
    shv_varioRate: "-2.5",
    shv_flights: '[{"site":"Amisbühl"}]',
  });
  const s = loadSettings(storage);
  assert.equal(s.lang, "fr");
  assert.equal(s.theme, "light");
  assert.equal(s.baseMap, "topoOsm");
  assert.equal(s.mapCategory, "AIRSPACE");
  assert.equal(s.meteoMode, "WEBCAM");
  assert.deepEqual(s.windFilter, ["N", "SW"]);
  assert.equal(s.varioRate, -2.5);
  assert.deepEqual(s.flights, [{ site: "Amisbühl" }]);
});

test("a missing, unparsable or unknown value falls back per key", () => {
  const d = defaultSettings();
  const { storage } = fakeStorage({
    shv_lang: "xx",
    shv_theme: "",
    shv_baseMap: "google",
    shv_mapCategory: "meteo",
    shv_windFilter: '["N","UP"]',
    shv_varioRate: "{",
    shv_flights: '{"not":"a list"}',
    shv_layers: "nope",
  });
  quiet(() => assert.deepEqual(loadSettings(storage), d));
  for (const [key, raw] of [
    ["windFilter", '["N","N"]'],
    ["varioRate", "7"],
    ["varioRate", '"1"'],
    ["layers", "[]"],
  ]) {
    const one = fakeStorage({ [`shv_${key}`]: raw }).storage;
    quiet(() => assert.deepEqual(loadSettings(one), d, `${key}=${raw}`));
  }
});

test("layers merge over the defaults", () => {
  const { storage } = fakeStorage({
    shv_layers:
      '{"airspace":true,"stations":false,"retired":true,"obstacles":"yes"}',
  });
  const { layers } = loadSettings(storage);
  assert.deepEqual(layers, {
    ...defaultSettings().layers,
    airspace: true,
    stations: false,
  });
});

test("a saved setting loads back, strings as plain strings", () => {
  const { storage, map } = fakeStorage();
  saveSetting(storage, "lang", "it");
  saveSetting(storage, "layers", {
    ...defaultSettings().layers,
    webcams: true,
  });
  saveSetting(storage, "windFilter", ["E"]);
  assert.equal(map.get("shv_lang"), "it");
  const s = loadSettings(storage);
  assert.equal(s.lang, "it");
  assert.equal(s.layers.webcams, true);
  assert.deepEqual(s.windFilter, ["E"]);
});

test("a throwing storage falls back and saving logs", () => {
  const throwing: KeyValueStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {},
  };
  const errors = quiet(() => {
    assert.deepEqual(loadSettings(throwing), defaultSettings());
    saveSetting(throwing, "theme", "light");
  });
  assert.ok(errors.length > 0);
});

test("the checklist goes to its own storage", () => {
  const local = fakeStorage();
  const session = fakeStorage();
  saveChecklist(session.storage, { p1: true, p2: false });
  assert.equal(local.map.size, 0);
  assert.deepEqual(loadChecklist(session.storage), { p1: true, p2: false });
  assert.deepEqual(loadChecklist(fakeStorage().storage), {});
  const odd = fakeStorage({ shv_checklist: '{"p1":true,"p2":"x"}' }).storage;
  assert.deepEqual(loadChecklist(odd), { p1: true });
  const bad = fakeStorage({ shv_checklist: "[" }).storage;
  quiet(() => assert.deepEqual(loadChecklist(bad), {}));
});

test("a blocked storage becomes one that keeps nothing", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  try {
    let storage: KeyValueStorage | undefined;
    const errors = quiet(() => (storage = browserStorage("localStorage")));
    assert.equal(errors.length, 1);
    storage?.setItem("shv_lang", "fr");
    assert.equal(storage?.getItem("shv_lang"), null);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("purgeLegacyAuth leaves only the other keys", () => {
  const { storage, map } = fakeStorage({
    shv_session_id: "abc",
    shv_profile: '{"firstName":"A"}',
    shv_lang: "fr",
  });
  purgeLegacyAuth(storage);
  assert.deepEqual([...map.keys()], ["shv_lang"]);
});

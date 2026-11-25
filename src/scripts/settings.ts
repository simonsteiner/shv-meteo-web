// The settings that outlive a page load. Every tab is its own page, so what
// lived only in memory (the map's base map, layers and filters, the vario's
// rate) would reset on each navigation; it persists in localStorage under
// `shv_*` keys, beside the keys the app already stored (language, theme,
// flight log). A missing, unparsable or unknown value falls back to its
// default, so an old or hand-edited value never breaks a page. The
// pre-flight checklist lives in sessionStorage: it survives moving between
// pages but not closing the tab. Storage is a parameter, for the tests.

import { isOneOf, isRecord } from "./coerce.ts";

export const LANGS = ["de", "fr", "it", "en"] as const;
const THEMES = ["dark", "light"] as const;
export const BASE_MAPS = [
  "topoLight",
  "topoColor",
  "topoSatellite",
  "topoOsm",
  "gliderChart",
] as const;
export const MAP_CATEGORIES = ["METEO", "AIRSPACE", "FLYING_AREAS"] as const;
export const METEO_MODES = [
  "WIND",
  "TEMPERATURE",
  "PRESSURE_DIFFERENCE",
  "WEBCAM",
  "NONE",
] as const;
export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
/** The vario slider's range in m/s (src/components/safety/Vario.astro). */
export const VARIO_RANGE = [-5, 6] as const;

export type Lang = (typeof LANGS)[number];
export type Theme = (typeof THEMES)[number];
export type BaseMap = (typeof BASE_MAPS)[number];
export type MapCategory = (typeof MAP_CATEGORIES)[number];
export type MeteoMode = (typeof METEO_MODES)[number];
export type Compass = (typeof COMPASS)[number];

export const LAYER_KEYS = [
  "launches",
  "landings",
  "landingPatterns",
  "airspace",
  "wildschutz",
  "obstacles",
  "stations",
  "webcams",
  "foehnAxis",
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export type Layers = Record<LayerKey, boolean>;

export interface Settings {
  lang: Lang;
  theme: Theme;
  baseMap: BaseMap;
  mapCategory: MapCategory;
  meteoMode: MeteoMode;
  layers: Layers;
  windFilter: Compass[];
  varioRate: number;
  /** The flight log; its entries pass through unchanged. */
  flights: unknown[];
}

/** Storage as the browser has it; only what this module calls. */
export type KeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/** The browser's localStorage or sessionStorage, or a storage that keeps
 * nothing where the browser blocks it: reading `window.localStorage` itself
 * throws then, before any try around getItem could catch it, or (Firefox
 * with dom.storage.enabled off) is null. */
export function browserStorage(
  name: "localStorage" | "sessionStorage",
): KeyValueStorage {
  const none = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  try {
    const storage: KeyValueStorage | null = globalThis[name];
    if (storage) return storage;
    console.error(`[settings] ${name} is off; settings won't persist`);
  } catch (err) {
    console.error(
      `[settings] ${name} is blocked; settings won't persist:`,
      err,
    );
  }
  return none;
}

export function defaultSettings(): Settings {
  return {
    lang: "de",
    theme: "dark",
    baseMap: "topoLight",
    mapCategory: "METEO",
    meteoMode: "WIND",
    layers: {
      launches: false,
      landings: false,
      landingPatterns: false,
      airspace: false,
      wildschutz: false,
      obstacles: false,
      stations: true,
      webcams: false,
      foehnAxis: false,
    },
    windFilter: [],
    varioRate: 1.2,
    flights: [],
  };
}

const KEY_PREFIX = "shv_";
const CHECKLIST_KEY = "shv_checklist";

/** Kept as plain strings, as `shv_lang` and `shv_theme` always were; every
 * other key holds JSON. */
const STRING_KEYS: ReadonlySet<keyof Settings> = new Set([
  "lang",
  "theme",
  "baseMap",
  "mapCategory",
  "meteoMode",
]);

const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: unknown): T | undefined =>
    isOneOf(allowed, v) ? v : undefined;

/** Each key's check: the value when allowed, else undefined. */
const PARSERS: {
  [K in keyof Settings]: (
    v: unknown,
    fallback: Settings[K],
  ) => Settings[K] | undefined;
} = {
  lang: oneOf(LANGS),
  theme: oneOf(THEMES),
  baseMap: oneOf(BASE_MAPS),
  mapCategory: oneOf(MAP_CATEGORIES),
  meteoMode: oneOf(METEO_MODES),
  layers: (v, fallback) => {
    if (!isRecord(v)) return undefined;
    const merged = { ...fallback };
    for (const key of LAYER_KEYS) {
      const value = v[key];
      if (typeof value === "boolean") merged[key] = value;
    }
    return merged;
  },
  windFilter: (v) => {
    if (!Array.isArray(v)) return undefined;
    const dirs = v.filter((d): d is Compass => isOneOf(COMPASS, d));
    return dirs.length === v.length && new Set(dirs).size === dirs.length
      ? dirs
      : undefined;
  },
  varioRate: (v) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= VARIO_RANGE[0] &&
    v <= VARIO_RANGE[1]
      ? v
      : undefined,
  flights: (v) => (Array.isArray(v) ? v : undefined),
};

function read(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch (err) {
    console.error(`[settings] Cannot read ${key}:`, err);
    return null;
  }
}

function loadOne<K extends keyof Settings>(
  local: KeyValueStorage,
  key: K,
  fallback: Settings[K],
): Settings[K] {
  const raw = read(local, KEY_PREFIX + key);
  if (raw === null) return fallback;
  let value: unknown = raw;
  if (!STRING_KEYS.has(key)) {
    try {
      value = JSON.parse(raw);
    } catch (err) {
      console.error(`[settings] Unparsable ${KEY_PREFIX + key}:`, err);
      return fallback;
    }
  }
  return PARSERS[key](value, fallback) ?? fallback;
}

/** Every setting from `local`, each falling back to its default. */
export function loadSettings(local: KeyValueStorage): Settings {
  const settings = defaultSettings();
  for (const key of Object.keys(settings) as (keyof Settings)[])
    (settings as Record<keyof Settings, unknown>)[key] = loadOne(
      local,
      key,
      settings[key],
    );
  return settings;
}

export function saveSetting<K extends keyof Settings>(
  local: KeyValueStorage,
  key: K,
  value: Settings[K],
): void {
  const raw = STRING_KEYS.has(key) ? String(value) : JSON.stringify(value);
  try {
    local.setItem(KEY_PREFIX + key, raw);
  } catch (err) {
    console.error(`[settings] Cannot save ${KEY_PREFIX + key}:`, err);
  }
}

/** The keys member login kept: a session id and the member's profile
 * (licence, insurance). Login is gone; each page load clears them, so no
 * personal data lingers in the browser. */
const LEGACY_AUTH_KEYS = ["shv_session_id", "shv_profile"];

export function purgeLegacyAuth(local: KeyValueStorage): void {
  for (const key of LEGACY_AUTH_KEYS) {
    try {
      local.removeItem(key);
    } catch (err) {
      console.error(`[settings] Cannot remove ${key}:`, err);
    }
  }
}

/** The ticked checklist points of this tab's session; only boolean entries. */
export function loadChecklist(
  session: KeyValueStorage,
): Record<string, boolean> {
  const raw = read(session, CHECKLIST_KEY);
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    console.error(`[settings] Unparsable ${CHECKLIST_KEY}:`, err);
    return {};
  }
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (e): e is [string, boolean] => typeof e[1] === "boolean",
    ),
  );
}

export function saveChecklist(
  session: KeyValueStorage,
  checklist: Record<string, boolean>,
): void {
  try {
    session.setItem(CHECKLIST_KEY, JSON.stringify(checklist));
  } catch (err) {
    console.error(`[settings] Cannot save ${CHECKLIST_KEY}:`, err);
  }
}

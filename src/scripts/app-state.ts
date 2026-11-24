// The app's state and its setters, which every page script shares through
// `store` (src/scripts/state.ts). Each tab is its own page, so what must
// outlive a page load is saved under `shv_*` keys through settings.ts and
// read back here; the rest (the search, the map's selection, the pilot's
// position) lives for one page. Storage and navigation are parameters, for
// the tests.

import { dictionaryFor, type Strings } from "./i18n/dictionaries.ts";
import type { LatLng } from "./maps/locate.ts";
import { CHECK_POINTS } from "./safety/checklist.ts";
import type { SelectionKind } from "./sheet/render.ts";
import {
  loadChecklist,
  loadSettings,
  saveChecklist,
  saveSetting,
  type BaseMap,
  type Compass,
  type KeyValueStorage,
  type Lang,
  type Layers,
  type MapCategory,
  type MeteoMode,
  type Settings,
  type Theme,
} from "./settings.ts";

export const TABS = ["map", "weather", "forecast", "safety"] as const;
export type Tab = (typeof TABS)[number];

export function isTab(v: unknown): v is Tab {
  return TABS.includes(v as Tab);
}

export interface State extends Settings {
  /** The page's tab, from `<body data-view>` (src/layouts/Base.astro). */
  activeTab: Tab;
  searchQuery: string;
  selectedSite: unknown;
  selectedStation: unknown;
  selectedWebcam: unknown;
  selectedObstacle: unknown;
  pilotLocation: LatLng | null;
  /** How many positions have arrived; the map centres on each new one. */
  pilotFix: number;
  /** The ticked pre-flight checklist points, per browser tab. */
  checklist: Record<string, boolean>;
  /** The vario starts muted on every page: audio may only start on a click. */
  varioMuted: boolean;
}

export type Listener = (state: State) => void;

/** The layers each map category shows; every other layer is hidden. */
const CATEGORY_LAYERS: Record<MapCategory, (keyof Layers)[]> = {
  METEO: ["stations"],
  AIRSPACE: ["airspace", "wildschutz"],
  FLYING_AREAS: ["launches", "landings", "landingPatterns"],
};

/** The live-weather layers each meteo mode shows (the others it hides). */
const MODE_LAYERS: Record<MeteoMode, (keyof Layers)[]> = {
  WIND: ["stations"],
  TEMPERATURE: ["stations"],
  PRESSURE_DIFFERENCE: ["foehnAxis"],
  WEBCAM: ["webcams"],
  NONE: [],
};
const MODE_SWITCHED: (keyof Layers)[] = ["stations", "webcams", "foehnAxis"];

export interface StoreOptions {
  local: KeyValueStorage;
  session: KeyValueStorage;
  /** `<body data-view>`; anything but a tab means the map. */
  view: string | undefined;
  /** Goes to another page; `location.assign` in the browser. */
  navigate: (path: string) => void;
}

export class AppState {
  readonly state: State;
  private readonly listeners = new Set<Listener>();
  private readonly local: KeyValueStorage;
  private readonly session: KeyValueStorage;
  private readonly navigate: (path: string) => void;

  constructor({ local, session, view, navigate }: StoreOptions) {
    this.local = local;
    this.session = session;
    this.navigate = navigate;
    const checklist: Record<string, boolean> = {};
    for (const point of CHECK_POINTS) checklist[point] = false;
    this.state = {
      ...loadSettings(local),
      activeTab: isTab(view) ? view : "map",
      searchQuery: "",
      selectedSite: null,
      selectedStation: null,
      selectedWebcam: null,
      selectedObstacle: null,
      pilotLocation: null,
      pilotFix: 0,
      checklist: { ...checklist, ...loadChecklist(session) },
      varioMuted: true,
    };
  }

  /** Calls `listener` after every change; the returned function stops it. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("[AppState.notify] Listener threw error:", err);
      }
    }
  }

  private save<K extends keyof Settings>(key: K, value: Settings[K]): void {
    (this.state as Settings)[key] = value;
    saveSetting(this.local, key, value);
  }

  /** The dictionary of the current UI language. */
  get t(): Strings {
    return dictionaryFor(this.state.lang);
  }

  /** Every tab is a page, so switching tabs navigates. */
  setTab(tab: Tab): void {
    this.navigate(`/${tab}/`);
  }

  setLang(lang: Lang): void {
    this.save("lang", lang);
    this.notify();
  }

  setTheme(theme: Theme): void {
    this.save("theme", theme);
    this.notify();
  }

  setBaseMap(baseMap: BaseMap): void {
    this.save("baseMap", baseMap);
    this.notify();
  }

  setMapCategory(category: MapCategory): void {
    this.state.mapCategory = category;
    saveSetting(this.local, "mapCategory", category);
    const shown = CATEGORY_LAYERS[category];
    const layers = { ...this.state.layers };
    for (const key of Object.keys(layers) as (keyof Layers)[])
      layers[key] = shown.includes(key);
    this.save("layers", layers);
    this.notify();
  }

  setMeteoMode(mode: MeteoMode): void {
    this.save("meteoMode", mode);
    const layers = { ...this.state.layers };
    for (const key of MODE_SWITCHED)
      layers[key] = MODE_LAYERS[mode].includes(key);
    this.save("layers", layers);
    this.notify();
  }

  toggleLayer(key: keyof Layers): void {
    if (!Object.prototype.hasOwnProperty.call(this.state.layers, key)) {
      console.error(`[AppState.toggleLayer] Unknown layer ${String(key)}`);
      return;
    }
    this.save("layers", {
      ...this.state.layers,
      [key]: !this.state.layers[key],
    });
    this.notify();
  }

  setSearchQuery(query: string): void {
    this.state.searchQuery = query;
    this.notify();
  }

  toggleWindFilter(dir: Compass): void {
    const dirs = this.state.windFilter;
    this.save(
      "windFilter",
      dirs.includes(dir) ? dirs.filter((d) => d !== dir) : [...dirs, dir],
    );
    this.notify();
  }

  clearWindFilter(): void {
    this.save("windFilter", []);
    this.notify();
  }

  /** The map's one selection; a null kind clears it. */
  select(kind: SelectionKind | null, value: unknown = null): void {
    this.state.selectedSite = kind === "site" ? value : null;
    this.state.selectedStation = kind === "station" ? value : null;
    this.state.selectedWebcam = kind === "webcam" ? value : null;
    this.state.selectedObstacle = kind === "obstacle" ? value : null;
    this.notify();
  }

  setPilotLocation(at: LatLng | null): void {
    this.state.pilotLocation = at;
    if (at) this.state.pilotFix += 1;
    this.notify();
  }

  private saveChecklist(): void {
    saveChecklist(this.session, this.state.checklist);
    this.notify();
  }

  setChecklistPoint(key: string, value: boolean): void {
    this.state.checklist[key] = value;
    this.saveChecklist();
  }

  checkAllChecklist(): void {
    for (const key of Object.keys(this.state.checklist))
      this.state.checklist[key] = true;
    this.saveChecklist();
  }

  resetChecklist(): void {
    for (const key of Object.keys(this.state.checklist))
      this.state.checklist[key] = false;
    this.saveChecklist();
  }

  addFlight(flight: unknown): void {
    this.save("flights", [flight, ...this.state.flights]);
    this.notify();
  }

  setVarioRate(rate: number): void {
    this.save("varioRate", Math.round(rate * 10) / 10);
    this.notify();
  }

  setVarioMuted(muted: boolean): void {
    this.state.varioMuted = muted;
    this.notify();
  }
}

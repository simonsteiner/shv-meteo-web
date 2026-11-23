import { getTranslation } from "./i18n/index.js";

import {
  browserStorage,
  loadChecklist,
  loadSettings,
  purgeLegacyAuth,
  saveChecklist,
  saveSetting,
} from "./scripts/settings.ts";

const TABS = ["map", "weather", "forecast", "safety"];

// Storages that never throw, even where the browser blocks them.
const local = browserStorage("localStorage");
const session = browserStorage("sessionStorage");
purgeLegacyAuth(local);

class AppState {
  constructor() {
    this.listeners = new Set();

    // Each tab is its own page (src/pages/<tab>/), so the settings that must
    // outlive a page load come from storage (src/scripts/settings.ts).
    const saved = loadSettings(local);
    const view = document.body.dataset.view;

    this.state = {
      activeTab: TABS.includes(view) ? view : "map", // set by the page (Base.astro)
      lang: saved.lang,
      theme: saved.theme,

      // Map configuration
      baseMap: saved.baseMap, // 'topoLight' | 'topoColor' | 'topoSatellite' | 'topoOsm'
      mapCategory: saved.mapCategory, // 'METEO' | 'AIRSPACE' | 'FLYING_AREAS'
      meteoMode: saved.meteoMode, // 'WIND' | 'TEMPERATURE' | 'PRESSURE_DIFFERENCE' | 'WEBCAM' | 'NONE'
      layers: saved.layers,
      searchQuery: "",
      windFilter: saved.windFilter, // e.g. ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
      selectedSite: null,
      selectedStation: null,
      selectedWebcam: null,
      selectedObstacle: null,
      pilotLocation: null,

      // Live data
      measurements: null,
      webcams: null,
      foehn: null,
      emagram: null,

      // Safety & Checklist: per browser tab (sessionStorage)
      checklist: {
        p1: false,
        p2: false,
        p3: false,
        p4: false,
        p5: false,
        ...loadChecklist(session),
      },

      // Flight Logbook
      flights: saved.flights,

      // Audio Vario: starts muted on every page, since audio may only start
      // on a click
      varioRate: saved.varioRate, // m/s
      varioMuted: true,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const listenersCopy = Array.from(this.listeners);
    for (const listener of listenersCopy) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("[AppState.notify] Listener threw error:", err);
      }
    }
  }

  get t() {
    return getTranslation(this.state.lang);
  }

  // Every tab is a page: switching tabs navigates. Clicking the active Map
  // tab resets the map: the search and the selections go with the reload,
  // the persisted wind filter is cleared first.
  setTab(tab) {
    if (this.state.activeTab === tab && tab !== "map") return;
    if (tab === "map" && this.state.activeTab === "map") {
      this.state.windFilter = [];
      saveSetting(local, "windFilter", []);
    }
    location.assign(`/${tab}/`);
  }

  setMapCategory(category) {
    this.state.mapCategory = category;
    saveSetting(local, "mapCategory", category);
    if (category === "METEO") {
      this.state.layers.stations = true;
      this.state.layers.launches = false;
      this.state.layers.landings = false;
      this.state.layers.landingPatterns = false;
      this.state.layers.airspace = false;
      this.state.layers.wildschutz = false;
      this.state.layers.obstacles = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    } else if (category === "AIRSPACE") {
      this.state.layers.airspace = true;
      this.state.layers.wildschutz = true;
      this.state.layers.stations = false;
      this.state.layers.launches = false;
      this.state.layers.landings = false;
      this.state.layers.landingPatterns = false;
      this.state.layers.obstacles = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    } else if (category === "FLYING_AREAS") {
      this.state.layers.launches = true;
      this.state.layers.landings = true;
      this.state.layers.landingPatterns = true;
      this.state.layers.airspace = false;
      this.state.layers.wildschutz = false;
      this.state.layers.stations = false;
      this.state.layers.obstacles = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    }
    saveSetting(local, "layers", this.state.layers);
    this.notify();
  }

  setLang(lang) {
    this.state.lang = lang;
    saveSetting(local, "lang", lang);
    this.notify();
  }

  setTheme(theme) {
    this.state.theme = theme;
    saveSetting(local, "theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    this.notify();
  }

  setBaseMap(baseMap) {
    this.state.baseMap = baseMap;
    saveSetting(local, "baseMap", baseMap);
    this.notify();
  }

  toggleLayer(layerKey) {
    if (Object.prototype.hasOwnProperty.call(this.state.layers, layerKey)) {
      this.state.layers[layerKey] = !this.state.layers[layerKey];
      saveSetting(local, "layers", this.state.layers);
      this.notify();
    }
  }

  setMeteoMode(mode) {
    this.state.meteoMode = mode;
    saveSetting(local, "meteoMode", mode);
    if (mode === "WIND" || mode === "TEMPERATURE") {
      this.state.layers.stations = true;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    } else if (mode === "PRESSURE_DIFFERENCE") {
      this.state.layers.stations = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = true;
    } else if (mode === "WEBCAM") {
      this.state.layers.stations = false;
      this.state.layers.webcams = true;
      this.state.layers.foehnAxis = false;
    } else if (mode === "NONE") {
      this.state.layers.stations = false;
      this.state.layers.webcams = false;
      this.state.layers.foehnAxis = false;
    }
    saveSetting(local, "layers", this.state.layers);
    this.notify();
  }

  setSearchQuery(q) {
    this.state.searchQuery = q;
    this.notify();
  }

  toggleWindFilter(dir) {
    const idx = this.state.windFilter.indexOf(dir);
    if (idx >= 0) {
      this.state.windFilter.splice(idx, 1);
    } else {
      this.state.windFilter.push(dir);
    }
    saveSetting(local, "windFilter", this.state.windFilter);
    this.notify();
  }

  clearWindFilter() {
    this.state.windFilter = [];
    saveSetting(local, "windFilter", []);
    this.notify();
  }

  selectSite(site) {
    this.state.selectedSite = site;
    this.notify();
  }

  selectStation(st) {
    this.state.selectedStation = st;
    this.notify();
  }

  selectWebcam(wc) {
    this.state.selectedWebcam = wc;
    if (wc) this.state.selectedObstacle = null;
    this.notify();
  }

  selectObstacle(obs) {
    this.state.selectedObstacle = obs;
    if (obs) {
      this.state.selectedSite = null;
      this.state.selectedStation = null;
      this.state.selectedWebcam = null;
    }
    this.notify();
  }

  setPilotLocation(latLng) {
    this.state.pilotLocation = latLng;
    this.notify();
  }

  setChecklistPoint(key, value) {
    this.state.checklist[key] = value;
    saveChecklist(session, this.state.checklist);
    this.notify();
  }

  checkAllChecklist() {
    Object.keys(this.state.checklist).forEach((k) => {
      this.state.checklist[k] = true;
    });
    saveChecklist(session, this.state.checklist);
    this.notify();
  }

  resetChecklist() {
    Object.keys(this.state.checklist).forEach((k) => {
      this.state.checklist[k] = false;
    });
    saveChecklist(session, this.state.checklist);
    this.notify();
  }

  addFlight(flight) {
    this.state.flights.unshift(flight);
    saveSetting(local, "flights", this.state.flights);
    this.notify();
  }

  setVarioRate(rate) {
    this.state.varioRate = Math.round(rate * 10) / 10;
    saveSetting(local, "varioRate", this.state.varioRate);
    this.notify();
  }

  setVarioMuted(muted) {
    this.state.varioMuted = muted;
    this.notify();
  }
}

export const store = new AppState();

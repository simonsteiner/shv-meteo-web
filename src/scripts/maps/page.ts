// The map page's behaviour over its static markup (src/components/map/):
// the Leaflet map and its layers, the layers drawer, the search and wind
// filter, the info panel and the bottom sheet (src/scripts/sheet/), every
// handler attached here rather than inline. Re-renders on each store
// change, which is how the header's language and theme switches reach the
// page. A selection handed over in the URL (src/scripts/handoff.ts) is
// taken out of it at once, so a reload doesn't select again.

import L from "leaflet";
import { store } from "../state.ts";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import {
  readHandoff,
  readZoom,
  withoutHandoff,
  type Handoff,
} from "../handoff.ts";
import { isOneOf } from "../coerce.ts";
import { applyText } from "../i18n/text.ts";
import { mountSheet, selectionOf } from "../sheet/render.ts";
import {
  BASE_MAPS,
  COMPASS,
  LAYER_KEYS,
  MAP_CATEGORIES,
  METEO_MODES,
  type Layers,
} from "../settings.ts";
import type { MeasurementFeature } from "../types.ts";
import { DEFAULT_CENTER, DEFAULT_ZOOM, pilotZoom, viewFor } from "./basemap.ts";
import type { LatLngTuple } from "./centroid.ts";
import {
  revealFor,
  stationModeFor,
  type HandoffTarget,
  type Loaded,
} from "./handoff-target.ts";
import { drawFoehn, drawStations, drawWebcams } from "./layer-meteo.ts";
import { obstacleLayer } from "./layer-obstacles.ts";
import { createMapSession, type Dataset, type Plan } from "./session.ts";
import { siteLayers } from "./layer-sites.ts";
import { zoneLayers } from "./layer-zones.ts";
import { locatePilot } from "./locate.ts";
import { centredIcon, createMap, showLayer } from "./view.ts";
import { controlsView, pressed, type Control } from "./controls.ts";
import type { FoehnReport } from "../foehn/report.ts";
import { weatherUrl } from "../weather/query.ts";

const { say } = store;

/** The drawer's toggle buttons, each by its data attribute. */
const CONTROL_SELECTORS: [Control, string][] = [
  ["wind", "[data-wind]"],
  ["meteoMode", "[data-meteo-mode]"],
  ["base", "[data-base]"],
  ["mapCategory", "[data-map-category]"],
];

/** A markup value the store has no member for: ignored, and logged. */
function unknown(attribute: string, value: unknown): void {
  console.error(`[maps] Unknown ${attribute} "${String(value)}"`);
}

export function mountMap(root: HTMLElement): void {
  const handoff: Handoff | null = readHandoff(location.search);
  const zoom = readZoom(location.search);
  const session = createMapSession({ handoff, zoom, say });
  if (handoff || zoom !== null)
    history.replaceState(history.state, "", withoutHandoff(location.href));

  const q = <T extends Element = HTMLElement>(s: string) => must<T>(root, s);
  const all = <T extends Element = HTMLElement>(s: string) =>
    Array.from(root.querySelectorAll<T>(s));
  const searchInput = q<HTMLInputElement>("[data-map-search]");
  const drawer = q("[data-drawer]");
  const drawerButton = q('[data-action="toggle-drawer"]');
  const infoPanel = q("[data-info-panel]");
  const infoButton = q('[data-action="toggle-info"]');

  const { map, setBaseMap } = createMap(
    q("[data-leaflet-map]"),
    store.state.baseMap,
    zoom,
  );
  const sites = siteLayers((f) => store.select("site", f));
  const zones = zoneLayers(say);
  const obstacles = obstacleLayer(
    map,
    (f) => store.select("obstacle", f),
    (bad) => {
      if (session.obstacles(bad)) render();
    },
  );
  const stationsLayer = L.layerGroup();
  const foehnLayer = L.layerGroup();
  const webcamsLayer = L.layerGroup();
  const layerOf: Record<keyof Layers, L.Layer> = {
    launches: sites.launches,
    landings: sites.landings,
    // the layer id stays landingPatterns: it is persisted in shv_* settings
    landingPatterns: sites.circuits,
    airspace: zones.airspace,
    wildschutz: zones.wildlife,
    obstacles: obstacles.layer,
    stations: stationsLayer,
    webcams: webcamsLayer,
    foehnAxis: foehnLayer,
  };
  const sheet = mountSheet(
    must<HTMLElement>(document, "#bottom-sheet-container"),
    () => store.select(null),
    say,
  );

  let stations: MeasurementFeature[] = [];
  let foehn: FoehnReport | null = null;
  let pilotMarker: L.Marker | null = null;

  function redrawStations(): void {
    if (!store.state.layers.stations) return;
    drawStations(
      stationsLayer,
      map,
      stations,
      stationModeFor(store.state.meteoMode),
      (f) => store.select("station", f),
    );
  }

  function moveTo(at: LatLngTuple | null): void {
    const view = viewFor(at, zoom, map.getZoom());
    if (view) map.setView(view.center, view.zoom);
  }

  // shows the handed-over selection's layer, selects it and goes there
  function takeHandoff(target: HandoffTarget | null): void {
    if (!target) return;
    const { kind, value } = target.selection;
    const reveal = revealFor(target.selection, store.state);
    if (reveal.meteoMode) store.setMeteoMode(reveal.meteoMode);
    if (reveal.clearSearch) store.setSearchQuery("");
    if (reveal.clearWind) store.clearWindFilter();
    for (const key of reveal.layers) store.toggleLayer(key);
    store.select(kind, value);
    moveTo(target.at);
  }

  function renderControls(statusText: string): void {
    const state = store.state;
    const view = controlsView(state, say);
    if (searchInput.value !== view.search) searchInput.value = view.search;
    const show = (selector: string, on: boolean) =>
      q(selector).classList.toggle("hidden", !on);
    show('.clear-btn[data-action="clear-search"]', view.searchShown);
    show("[data-filter-pills]", view.pillsShown);
    show('[data-pill="wind"]', view.windShown);
    show('[data-pill="search"]', view.searchShown);
    show("[data-wind-count]", view.windShown);
    show("[data-wind-reset]", view.windShown);
    show("[data-dabs-link]", view.dabsShown);
    q('[data-pill-text="wind"]').textContent = view.windPillText;
    q('[data-pill-text="search"]').textContent = view.searchPillText;
    q("[data-wind-count]").textContent = String(view.windCount);
    q("[data-wind-reset-label]").textContent = view.windResetLabel;

    for (const [control, selector] of CONTROL_SELECTORS)
      for (const b of all(selector)) {
        const on = pressed(state, control, b.dataset[control]);
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      }
    for (const pane of all("[data-pane]")) {
      const on = pane.dataset.pane === state.mapCategory;
      pane.classList.toggle("active", on);
      pane.classList.toggle("hidden", !on);
    }
    for (const box of all<HTMLInputElement>("input[data-layer]")) {
      const key = box.dataset.layer;
      if (isOneOf(LAYER_KEYS, key)) box.checked = state.layers[key];
      else unknown("data-layer", key);
    }
    const status = q("[data-map-status]");
    status.textContent = statusText;
    status.classList.toggle("hidden", !status.textContent);
  }

  function renderPilot(centre: Plan["pilot"]): void {
    const pilot = store.state.pilotLocation;
    if (!pilot) return;
    const at: LatLngTuple = [pilot.lat, pilot.lng];
    if (pilotMarker) pilotMarker.setLatLng(at);
    else
      pilotMarker = L.marker(at, {
        icon: centredIcon(
          "pilot-loc-icon",
          '<div class="pilot-pulse"><div class="pilot-center"></div></div>',
          [24, 24],
        ),
      }).addTo(map);
    if (centre) map.setView(at, pilotZoom(centre.zoom, map.getZoom()));
  }

  function render(): void {
    const state = store.state;
    const selection = selectionOf(state);
    const { redraw, status, pilot } = session.plan(state, selection);
    if (redraw.text) applyText(root, store.t);
    setBaseMap(state.baseMap);
    for (const key of LAYER_KEYS)
      showLayer(map, layerOf[key], state.layers[key] === true);
    if (redraw.stations) redrawStations();
    if (redraw.text) drawFoehn(foehnLayer, foehn, say, openWeather);
    if (redraw.sites)
      sites.draw(state.searchQuery, state.windFilter, say, state.lang);
    renderControls(status);
    renderPilot(pilot);
    if (redraw.sheet) sheet.show(selection, sites.names);
    // the obstacles load when shown and as the map moves, and go when hidden.
    // Last, because below their minimum zoom update() answers onLoad at once,
    // and the render that starts must not be overwritten by this one's status
    if (redraw.obstacles === "load") void obstacles.update();
    else if (redraw.obstacles === "clear") obstacles.clear();
  }

  function openWeather(pairId: string): void {
    location.assign(weatherUrl(pairId));
  }

  function setDrawer(open: boolean): void {
    drawer.classList.toggle("hidden", !open);
    drawerButton.classList.toggle("active", open);
    drawerButton.setAttribute("aria-expanded", String(open));
  }

  function setInfo(open: boolean): void {
    infoPanel.classList.toggle("hidden", !open);
    infoButton.setAttribute("aria-expanded", String(open));
  }

  const actions: Record<string, () => void> = {
    "toggle-drawer": () => setDrawer(drawer.classList.contains("hidden")),
    "close-drawer": () => setDrawer(false),
    "toggle-info": () => setInfo(infoPanel.classList.contains("hidden")),
    "close-info": () => setInfo(false),
    "clear-search": () => store.setSearchQuery(""),
    "clear-wind": () => store.clearWindFilter(),
    centre: () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM),
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const el = target.closest<HTMLElement>(
      "[data-action], [data-map-category], [data-meteo-mode], [data-base], [data-wind]",
    );
    if (!el) return;
    const { action, mapCategory, meteoMode, base, wind } = el.dataset;
    if (action && actions[action]) actions[action]();
    else if (mapCategory !== undefined) {
      if (isOneOf(MAP_CATEGORIES, mapCategory))
        store.setMapCategory(mapCategory);
      else unknown("data-map-category", mapCategory);
    } else if (meteoMode !== undefined) {
      if (isOneOf(METEO_MODES, meteoMode)) store.setMeteoMode(meteoMode);
      else unknown("data-meteo-mode", meteoMode);
    } else if (base !== undefined) {
      if (isOneOf(BASE_MAPS, base)) store.setBaseMap(base);
      else unknown("data-base", base);
    } else if (wind !== undefined) {
      if (isOneOf(COMPASS, wind)) store.toggleWindFilter(wind);
      else unknown("data-wind", wind);
    }
  });
  root.addEventListener("change", (event) => {
    const layer = (event.target as HTMLElement).dataset?.layer;
    if (layer === undefined) return;
    if (isOneOf(LAYER_KEYS, layer)) store.toggleLayer(layer);
    else unknown("data-layer", layer);
  });
  searchInput.addEventListener("input", () =>
    store.setSearchQuery(searchInput.value),
  );
  // a click outside the drawer or the info panel closes it
  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    if (!drawer.contains(target) && !drawerButton.contains(target))
      setDrawer(false);
    if (!infoPanel.contains(target) && !infoButton.contains(target))
      setInfo(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setDrawer(false);
    setInfo(false);
  });

  map.on("moveend", () => {
    if (store.state.layers.obstacles) void obstacles.update();
    redrawStations();
  });
  map.on("click", () => {
    if (selectionOf(store.state)) store.select(null);
  });

  // Each data set loads on its own, so a slow or failed one holds up none
  // of the others; the session counts a failure (logged), a throw while
  // drawing the data included, and the map says so while the layer is shown.
  function load<T>(
    dataset: Dataset,
    call: Promise<T | null>,
    label: string,
    use: (data: T) => Loaded | void,
  ): void {
    void call.then((data) => {
      try {
        takeHandoff(session.settle(dataset, data, label, use));
      } finally {
        render();
      }
    });
  }

  load(
    "sites",
    ShvApi.getFlyingSites(),
    "[maps] Cannot load the flying sites:",
    (data) => {
      const features = data.features ?? [];
      sites.setData(features);
      return { kind: "site", items: features };
    },
  );
  load(
    "airspaces",
    ShvApi.getAirspaces(),
    "[maps] Cannot load the airspaces:",
    (data) => {
      zones.airspace.addData(data);
    },
  );
  load(
    "wildlife",
    ShvApi.getWildschutz(),
    "[maps] Cannot load the wildlife reserves:",
    (data) => {
      zones.wildlife.addData(data);
    },
  );
  load(
    "measurements",
    ShvApi.getMeasurements(),
    "[maps] Cannot load the measurements:",
    (data) => {
      stations = data.features ?? [];
      redrawStations();
      return { kind: "station", items: stations };
    },
  );
  load(
    "foehn",
    ShvApi.getFoehn(),
    "[maps] Cannot load the Foehn report:",
    (report) => {
      foehn = report;
      drawFoehn(foehnLayer, foehn, say, openWeather);
    },
  );
  load(
    "webcams",
    ShvApi.getWebcams(),
    "[maps] Cannot load the webcams:",
    (data) => {
      const webcams = data.webcams ?? [];
      drawWebcams(webcamsLayer, webcams, (w) => store.select("webcam", w));
      return { kind: "webcam", items: webcams };
    },
  );
  if (handoff && "locate" in handoff)
    void locatePilot().then((at) => {
      if (at) store.setPilotLocation(at);
      session.locateEnded();
    });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-map-page]");
if (root) mountMap(root);
else console.error("[maps] The page has no [data-map-page] root");

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
import { applyText, fill } from "../i18n/text.ts";
import { mountSheet, selectionOf, type Selection } from "../sheet/render.ts";
import type {
  BaseMap,
  Compass,
  Layers,
  MapCategory,
  MeteoMode,
} from "../settings.ts";
import type { FlyingSiteFeature, MeasurementFeature } from "../types.ts";
import { DEFAULT_CENTER, DEFAULT_ZOOM, pilotZoom, viewFor } from "./basemap.ts";
import type { LatLngTuple } from "./centroid.ts";
import {
  findHandoff,
  revealFor,
  type HandoffTarget,
} from "./handoff-target.ts";
import { drawFoehn, drawStations, drawWebcams } from "./layer-meteo.ts";
import { obstacleLayer } from "./layer-obstacles.ts";
import { failedShown, loadStatusText, type Dataset } from "./load-status.ts";
import { siteLayers } from "./layer-sites.ts";
import { zoneLayers } from "./layer-zones.ts";
import { locatePilot } from "./locate.ts";
import { centredIcon, createMap, showLayer } from "./view.ts";
import type { FoehnReport } from "../foehn/report.ts";
import { weatherUrl } from "../weather/query.ts";

const { say } = store;

export function mountMap(root: HTMLElement): void {
  const handoff: Handoff | null = readHandoff(location.search);
  const zoom = readZoom(location.search);
  // ?z sets the zoom of a ?locate handoff only, and only once, so the
  // header's GPS button later keeps the zoom (pilotZoom)
  let locateZoom = handoff && "locate" in handoff ? zoom : null;
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
  const obstacles = obstacleLayer(map, (f) => store.select("obstacle", f));
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
  let pilotFix = 0;
  const failed = new Set<Dataset>();
  // what was drawn last, so a store change redraws only what it touched
  let lang: string | null = null;
  let sitesKey = "";
  let stationsMode: MeteoMode | null = null;
  let obstaclesShown = false;
  let shownSelection: Selection | null = null;
  let sheetLang: string | null = null;

  function stationMode(): "WIND" | "TEMPERATURE" {
    return store.state.meteoMode === "TEMPERATURE" ? "TEMPERATURE" : "WIND";
  }

  function redrawStations(): void {
    if (!store.state.layers.stations) return;
    stationsMode = store.state.meteoMode;
    drawStations(stationsLayer, map, stations, stationMode(), (f) =>
      store.select("station", f),
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
    const reveal = revealFor(kind, store.state);
    if (reveal.meteoMode) store.setMeteoMode(reveal.meteoMode);
    for (const key of reveal.layers) store.toggleLayer(key);
    store.select(kind, value);
    moveTo(target.at);
  }

  function renderControls(): void {
    const {
      searchQuery: search,
      windFilter: wind,
      layers,
      meteoMode,
      baseMap,
      mapCategory,
    } = store.state;
    if (searchInput.value !== search) searchInput.value = search;
    q('.clear-btn[data-action="clear-search"]').classList.toggle(
      "hidden",
      !search,
    );
    q("[data-filter-pills]").classList.toggle(
      "hidden",
      !search && wind.length === 0,
    );
    q('[data-pill="wind"]').classList.toggle("hidden", wind.length === 0);
    q('[data-pill="search"]').classList.toggle("hidden", !search);
    const dirs = wind.join(", ");
    q('[data-pill-text="wind"]').textContent = fill(say("map.windPill"), {
      dirs,
    });
    q('[data-pill-text="search"]').textContent = `"${search}"`;
    const badge = q("[data-wind-count]");
    badge.classList.toggle("hidden", wind.length === 0);
    badge.textContent = String(wind.length);
    q("[data-wind-reset]").classList.toggle("hidden", wind.length === 0);
    q("[data-wind-reset-label]").textContent = fill(say("map.resetWind"), {
      dirs,
    });

    const press = (el: HTMLElement, on: boolean) => {
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", String(on));
    };
    for (const b of all("[data-wind]"))
      press(b, (wind as readonly string[]).includes(b.dataset.wind ?? ""));
    for (const b of all("[data-meteo-mode]"))
      press(b, b.dataset.meteoMode === meteoMode);
    for (const b of all("[data-base]")) press(b, b.dataset.base === baseMap);
    for (const b of all("[data-map-category]"))
      press(b, b.dataset.mapCategory === mapCategory);
    for (const pane of all("[data-pane]")) {
      const on = pane.dataset.pane === mapCategory;
      pane.classList.toggle("active", on);
      pane.classList.toggle("hidden", !on);
    }
    for (const box of all<HTMLInputElement>("input[data-layer]")) {
      const key = box.dataset.layer as keyof Layers;
      box.checked = layers[key] === true;
    }
    q("[data-dabs-link]").classList.toggle(
      "hidden",
      mapCategory !== "AIRSPACE",
    );
    const status = q("[data-map-status]");
    status.textContent = loadStatusText(failedShown(failed, layers), say);
    status.classList.toggle("hidden", !status.textContent);
  }

  function renderPilot(): void {
    const { pilotLocation: pilot, pilotFix: fix } = store.state;
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
    // each new position, from the GPS button or ?locate, centres the map
    if (fix === pilotFix) return;
    pilotFix = fix;
    map.setView(at, pilotZoom(locateZoom, map.getZoom()));
    locateZoom = null;
  }

  function render(): void {
    const state = store.state;
    const langChanged = state.lang !== lang;
    if (langChanged) {
      lang = state.lang;
      applyText(root, store.t);
    }
    setBaseMap(state.baseMap);
    for (const key of Object.keys(layerOf) as (keyof Layers)[])
      showLayer(map, layerOf[key], state.layers[key] === true);
    // the obstacles load when shown and as the map moves, and go when hidden
    if (state.layers.obstacles !== obstaclesShown) {
      obstaclesShown = state.layers.obstacles;
      if (obstaclesShown) void obstacles.update();
      else obstacles.clear();
    }
    // hidden stations aren't redrawn as the map moves, so showing them
    // draws them afresh
    if (!state.layers.stations) stationsMode = null;
    else if (state.meteoMode !== stationsMode) redrawStations();
    if (langChanged) drawFoehn(foehnLayer, foehn, say, openWeather);

    const key = `${state.searchQuery}|${state.windFilter.join(",")}|${state.lang}`;
    if (key !== sitesKey) {
      sitesKey = key;
      sites.draw(state.searchQuery, state.windFilter, say, state.lang);
    }
    renderControls();
    renderPilot();

    const selection = selectionOf(state);
    const same =
      selection?.kind === shownSelection?.kind &&
      selection?.value === shownSelection?.value;
    if (!same || state.lang !== sheetLang) {
      shownSelection = selection;
      sheetLang = state.lang;
      sheet.show(selection, sites.names);
    }
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
    else if (mapCategory) store.setMapCategory(mapCategory as MapCategory);
    else if (meteoMode) store.setMeteoMode(meteoMode as MeteoMode);
    else if (base) store.setBaseMap(base as BaseMap);
    else if (wind) store.toggleWindFilter(wind as Compass);
  });
  root.addEventListener("change", (event) => {
    const layer = (event.target as HTMLElement).dataset?.layer;
    if (layer) store.toggleLayer(layer as keyof Layers);
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
  // of the others; a failure leaves its layer empty and says so while the
  // layer is shown.
  function fail(dataset: Dataset): void {
    failed.add(dataset);
    render();
  }

  ShvApi.getFlyingSites()
    .then((data) => {
      const features = (data.features ?? []) as FlyingSiteFeature[];
      sites.setData(features);
      sitesKey = "";
      takeHandoff(findHandoff(handoff, { kind: "site", items: features }));
      render();
    })
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the flying sites:", err);
      fail("sites");
    });
  ShvApi.getAirspaces()
    .then((data) => zones.airspace.addData(data as GeoJSON.FeatureCollection))
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the airspaces:", err);
      fail("airspaces");
    });
  ShvApi.getWildschutz()
    .then((data) => zones.wildlife.addData(data as GeoJSON.FeatureCollection))
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the wildlife zones:", err);
      fail("wildlife");
    });
  ShvApi.getMeasurements()
    .then((data) => {
      // getJson has logged a failed call
      if (!data) return fail("measurements");
      stations = data.features ?? [];
      stationsMode = null;
      redrawStations();
      takeHandoff(findHandoff(handoff, { kind: "station", items: stations }));
    })
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the measurements:", err);
      fail("measurements");
    });
  ShvApi.getFoehn()
    .then((report) => {
      if (!report) return fail("foehn");
      foehn = report;
      drawFoehn(foehnLayer, foehn, say, openWeather);
    })
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the Foehn report:", err);
      fail("foehn");
    });
  ShvApi.getWebcams()
    .then((data) => {
      if (!data) return fail("webcams");
      const webcams = data.webcams ?? [];
      drawWebcams(webcamsLayer, webcams, (w) => store.select("webcam", w));
      takeHandoff(findHandoff(handoff, { kind: "webcam", items: webcams }));
    })
    .catch((err: unknown) => {
      console.error("[maps] Cannot load the webcams:", err);
      fail("webcams");
    });
  if (handoff && "locate" in handoff)
    void locatePilot().then((at) => {
      if (at) store.setPilotLocation(at);
      locateZoom = null;
    });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-map-page]");
if (root) mountMap(root);
else console.error("[maps] The page has no [data-map-page] root");

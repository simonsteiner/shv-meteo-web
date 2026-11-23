// The map page's behaviour over its static markup (src/components/map/):
// the Leaflet map and its layers, the layers drawer, the search and wind
// filter, the info panel and the bottom sheet (src/scripts/sheet/), every
// handler attached here rather than inline. Re-renders on each store
// change, which is how the header's language and theme switches reach the
// page. A selection handed over in the URL (src/scripts/handoff.ts) is
// taken out of it at once, so a reload doesn't select again.

import L from "leaflet";
import { store } from "../../state.js";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import {
  readHandoff,
  readZoom,
  withoutHandoff,
  type Handoff,
} from "../handoff.ts";
import {
  applyText,
  fill,
  say as sayIn,
  type Dictionary,
  type Say,
} from "../i18n/text.ts";
import {
  mountSheet,
  selectionOf,
  type Selection,
  type SelectionKind,
} from "../sheet/render.ts";
import type { BaseMap, Layers, MapCategory, MeteoMode } from "../settings.ts";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  Webcam,
} from "../types.ts";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  PILOT_ZOOM,
  viewFor,
} from "./basemap.ts";
import { featureLatLng, type LatLngTuple } from "./centroid.ts";
import { drawFoehn, drawStations, drawWebcams } from "./layer-meteo.ts";
import { obstacleLayer } from "./layer-obstacles.ts";
import { siteLayers } from "./layer-sites.ts";
import { zoneLayers } from "./layer-zones.ts";
import { locatePilot, type LatLng } from "./locate.ts";
import { findSite } from "./sites.ts";
import { stationLatLng } from "./stations.ts";
import { centredIcon, createMap, showLayer } from "./view.ts";
import type { FoehnReport } from "../foehn/report.ts";

const dictionary = () => store.t as unknown as Dictionary;
const say: Say = (key) => sayIn(dictionary(), key);

function select(kind: SelectionKind | null, value: unknown = null): void {
  store.select(kind, value);
}

export function mountMap(root: HTMLElement): void {
  const handoff: Handoff | null = readHandoff(location.search);
  const zoom = readZoom(location.search);
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
  const sites = siteLayers((f) => select("site", f));
  const zones = zoneLayers(() => say);
  const obstacles = obstacleLayer(map, (f) => select("obstacle", f));
  const stationsLayer = L.layerGroup();
  const foehnLayer = L.layerGroup();
  const webcamsLayer = L.layerGroup();
  const layerOf: Record<keyof Layers, L.Layer> = {
    launches: sites.launches,
    landings: sites.landings,
    landingPatterns: sites.patterns,
    airspace: zones.airspace,
    wildschutz: zones.wildlife,
    obstacles: obstacles.layer,
    stations: stationsLayer,
    webcams: webcamsLayer,
    foehnAxis: foehnLayer,
  };
  const sheet = mountSheet(
    must<HTMLElement>(document, "#bottom-sheet-container"),
    () => select(null),
    () => say,
  );

  let stations: MeasurementFeature[] = [];
  let webcams: Webcam[] = [];
  let foehn: FoehnReport | null = null;
  let pilotMarker: L.Marker | null = null;
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
      select("station", f),
    );
  }

  function moveTo(at: LatLngTuple | null): void {
    const view = viewFor(at, zoom, map.getZoom());
    if (view) map.setView(view.center, view.zoom);
  }

  function renderControls(): void {
    const { searchQuery, windFilter, layers, meteoMode, baseMap, mapCategory } =
      store.state;
    const search: string = searchQuery;
    const wind: string[] = windFilter;
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
      press(b, wind.includes(b.dataset.wind ?? ""));
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
  }

  function renderPilot(): void {
    const pilot = store.state.pilotLocation as LatLng | null;
    if (!pilot) return;
    const at: LatLngTuple = [pilot.lat, pilot.lng];
    if (pilotMarker) {
      pilotMarker.setLatLng(at);
      return;
    }
    pilotMarker = L.marker(at, {
      icon: centredIcon(
        "pilot-loc-icon",
        '<div class="pilot-pulse"><div class="pilot-center"></div></div>',
        [24, 24],
      ),
    }).addTo(map);
    map.setView(at, zoom ?? PILOT_ZOOM);
  }

  function render(): void {
    const state = store.state;
    const langChanged = state.lang !== lang;
    if (langChanged) {
      lang = state.lang;
      applyText(root, dictionary());
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
    if (langChanged) drawFoehn(foehnLayer, foehn, state.lang, openWeather);

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
      sheet.show(selection, say, sites.names);
    }
  }

  function openWeather(): void {
    store.setTab("weather");
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
    else if (wind) store.toggleWindFilter(wind);
  });
  root.addEventListener("change", (event) => {
    const layer = (event.target as HTMLElement).dataset?.layer;
    if (layer) store.toggleLayer(layer);
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
    if (selectionOf(store.state)) select(null);
  });

  // Each data set loads on its own, so a slow or failed one holds up none
  // of the others; a failure leaves its layer empty.
  ShvApi.getFlyingSites()
    .then((data) => {
      const features = (data.features ?? []) as FlyingSiteFeature[];
      sites.setData(features);
      sitesKey = "";
      if (handoff && "site" in handoff) {
        const site = findSite(features, handoff.site);
        if (!site)
          console.error(`[maps] Handed-over site not found: ${handoff.site}`);
        else {
          select("site", site);
          moveTo(featureLatLng(site));
        }
      }
      render();
    })
    .catch((err: unknown) =>
      console.error("[maps] Cannot load the flying sites:", err),
    );
  ShvApi.getAirspaces()
    .then((data) => zones.airspace.addData(data as GeoJSON.FeatureCollection))
    .catch((err: unknown) =>
      console.error("[maps] Cannot load the airspaces:", err),
    );
  ShvApi.getWildschutz()
    .then((data) => zones.wildlife.addData(data as GeoJSON.FeatureCollection))
    .catch((err: unknown) =>
      console.error("[maps] Cannot load the wildlife zones:", err),
    );
  ShvApi.getMeasurements().then((data) => {
    stations = data?.features ?? [];
    stationsMode = null;
    redrawStations();
    if (handoff && "station" in handoff) {
      const st = stations.find((f) => f.id === handoff.station);
      if (!st)
        console.error(
          `[maps] Handed-over station not found: ${handoff.station}`,
        );
      else {
        select("station", st);
        moveTo(stationLatLng(st));
      }
    }
  });
  ShvApi.getFoehn().then((report) => {
    foehn = report;
    drawFoehn(foehnLayer, foehn, store.state.lang, openWeather);
  });
  ShvApi.getWebcams().then((data) => {
    webcams = data?.webcams ?? [];
    drawWebcams(webcamsLayer, webcams, (w) => select("webcam", w));
    if (handoff && "webcam" in handoff) {
      const cam = webcams.find((w) => w.identifier === handoff.webcam);
      if (cam) select("webcam", cam);
      else
        console.error(`[maps] Handed-over webcam not found: ${handoff.webcam}`);
    }
  });
  if (handoff && "locate" in handoff)
    void locatePilot().then((at) => {
      if (at) store.setPilotLocation(at);
    });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-map-page]");
if (root) mountMap(root);
else console.error("[maps] The page has no [data-map-page] root");

// The sounding section (/forecast/emagram/): the catalogue's stations on
// a Swisstopo map, a search and the popular stations, and the selected
// station's emagram (emagram-card.ts). `?station=<name>` opens a station
// and follows the choice; Interlaken is the default.

import L from "leaflet";
import { store } from "../../state.js";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import { escapeHtml } from "../escape.ts";
import { page } from "./page.ts";
import { applyText } from "../i18n/text.ts";
import {
  storeDictionary as dictionary,
  storeSay as say,
} from "../i18n/store.ts";
import type { SoundingStation } from "../types.ts";
import { emagramCard } from "./emagram-card.ts";
import { readStation, withParams } from "./query.ts";
import { localeFor } from "./text.ts";

const POPULAR = [
  "Interlaken",
  "Engelberg",
  "Payerne",
  "Fiesch",
  "Zermatt",
  "Scuol",
  "Davos",
  "Chur",
  "Zürich",
  "Sion",
];
const DEFAULTS = ["Interlaken", "Engelberg"];
const STATION_ZOOM = 9;

/** How a selection moves the page: `zoom` brings the map (and card) to the
 * station, `writeUrl` puts it in `?station=`. */
interface Selection {
  zoom: boolean;
  writeUrl: boolean;
}
const USER: Selection = { zoom: true, writeUrl: true };

export function mountEmagram(root: HTMLElement): void {
  let stations: SoundingStation[] = [];
  let selected: SoundingStation | null = null;
  let search = "";
  let lang: string | null = null;
  let map: L.Map | null = null;
  let markers: L.LayerGroup | null = null;
  const pills = must<HTMLElement>(root, "[data-popular-pills]");
  const detail = must<HTMLElement>(root, "[data-emagram-detail]");
  const card = emagramCard(
    root,
    say,
    () => localeFor(store.state.lang),
    () => select(null, USER),
  );

  function drawMarkers(): void {
    if (!markers) return;
    markers.clearLayers();
    const q = search.trim().toLowerCase();
    for (const st of stations) {
      if (q && !st.name.toLowerCase().includes(q)) continue;
      const icon = L.divIcon({
        className: "custom-emagram-div-icon",
        html: `<div class="emagram-map-pin${st === selected ? " selected" : ""}"><span class="pin-symbol">📈</span><span class="pin-label">${escapeHtml(st.name)}</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([st.lat, st.lon], { icon })
        .on("click", () => select(st, USER))
        .addTo(markers);
    }
  }

  function drawPills(): void {
    pills.innerHTML = POPULAR.map((name) =>
      stations.find((s) => s.name === name),
    )
      .filter((st): st is SoundingStation => !!st)
      .map(
        (st) =>
          `<button type="button" class="popular-station-pill${st === selected ? " active" : ""}" data-station="${escapeHtml(st.name)}">${escapeHtml(st.name)} (${escapeHtml(st.elevation)}m)</button>`,
      )
      .join("");
  }

  function select(
    st: SoundingStation | null,
    { zoom, writeUrl }: Selection,
  ): void {
    selected = st;
    drawMarkers();
    drawPills();
    // the default station stays out of the address; a choice goes in
    if (writeUrl)
      history.replaceState(
        history.state,
        "",
        withParams(location.href, { station: st?.name ?? null }),
      );
    if (!st) {
      card.pick();
      if (zoom)
        map
          ?.getContainer()
          .scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (zoom) map?.setView([st.lat, st.lon], STATION_ZOOM, { animate: true });
    card.show(st.name, undefined);
    if (zoom) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    ShvApi.getEmagramForecast(st.name)
      .catch((err: unknown) => {
        console.error("[forecast] Cannot load the sounding of", st.name, err);
        return null;
      })
      .then((sounding) => {
        if (selected === st) card.show(st.name, sounding);
      });
  }

  function render(): void {
    if (store.state.lang === lang) return;
    lang = store.state.lang;
    applyText(page(root), dictionary());
    card.refresh();
  }

  root.addEventListener("click", (event) => {
    const name = (event.target as Element).closest<HTMLElement>(
      "[data-station]",
    )?.dataset.station;
    const st = stations.find((s) => s.name === name);
    if (st) select(st, USER);
  });
  const input = must<HTMLInputElement>(root, "[data-station-search]");
  input.addEventListener("input", () => {
    search = input.value;
    drawMarkers();
    const q = search.trim().toLowerCase();
    const first = q
      ? stations.find((s) => s.name.toLowerCase().includes(q))
      : null;
    if (first)
      map?.setView([first.lat, first.lon], STATION_ZOOM, { animate: true });
  });

  map = L.map(must<HTMLElement>(root, "[data-emagram-map]"), {
    center: [46.8182, 8.2275],
    zoom: 8,
    zoomControl: true,
    attributionControl: false,
  });
  L.tileLayer(
    "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
    { maxZoom: 18, attribution: "© swisstopo" },
  ).addTo(map);
  markers = L.layerGroup().addTo(map);

  store.subscribe(render);
  render();
  card.pick();

  ShvApi.getPrevitempsStations()
    .catch((err: unknown) => {
      console.error("[forecast] Cannot load the station list:", err);
      return [] as SoundingStation[];
    })
    .then((list) => {
      stations = list;
      const status = must<HTMLElement>(root, "[data-stations-status]");
      status.hidden = list.length > 0;
      if (list.length === 0) return;
      // a linked station is a choice: zoom to it, the address already has it
      const linked = readStation(location.search, list);
      const initial =
        linked ??
        DEFAULTS.map((n) => list.find((s) => s.name === n)).find(Boolean) ??
        list[0];
      select(initial, { zoom: linked !== null, writeUrl: false });
    });
}

const root = document.querySelector<HTMLElement>("[data-forecast-emagram]");
if (root) mountEmagram(root);
else console.error("[forecast] The page has no [data-forecast-emagram] root");

// The weather page's behaviour over its static markup
// (src/components/weather/): the station pairs from ShvApi.getFoehn, the
// live station and webcam lists, and the station dialog (modal.ts). The
// tab and pair live in the URL (query.ts), so a link opens the same view.
// Re-renders on each store change, which is how the header's language and
// theme switches reach the page.

import type { Chart } from "chart.js";
import { store } from "../../state.js";
import { ShvApi } from "../api.ts";
import { drawChart } from "../charts/draw.ts";
import { foehnChartConfig } from "../charts/foehn.ts";
import { chartColors } from "../charts/theme.ts";
import { must } from "../dom.ts";
import { DEFAULT_PAIR } from "../foehn/pairs.ts";
import type { FoehnReport } from "../foehn/report.ts";
import { handoffUrl } from "../handoff.ts";
import { applyText, say as sayIn, type Dictionary } from "../i18n/text.ts";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { pairPillsHtml, stationCardHtml, webcamCardHtml } from "./cards.ts";
import { stationModal } from "./modal.ts";
import {
  bannerClass,
  bannerIcon,
  chartTitleKey,
  formatDelta,
  pairDescription,
  sideKeys,
  stationReading,
} from "./pair.ts";
import {
  readWeatherQuery,
  withWeatherQuery,
  type WeatherTab,
} from "./query.ts";
import { filterStations, PROVIDERS, type Provider } from "./stations.ts";
import { filterWebcams } from "./webcams.ts";

/** How many cards a list shows, as the old view did. */
const MAX_STATIONS = 48;
const MAX_WEBCAMS = 36;

const dictionary = () => store.t as unknown as Dictionary;
const say = (key: string) => sayIn(dictionary(), key);

export function mountWeather(root: HTMLElement): void {
  const query = readWeatherQuery(location.search);
  let pairId = query.pair ?? DEFAULT_PAIR;
  let tab: WeatherTab = query.tab ?? "stations";
  let provider: Provider = "ALL";
  let search = "";
  // undefined while loading, null when the call failed
  let foehn: FoehnReport | null | undefined;
  let foehnPair = pairId;
  let stations: MeasurementFeature[] | null | undefined;
  let webcams: Webcam[] | null | undefined;
  let lang: string | null = null;
  let chart: Chart | null = null;
  let chartKey = "";

  const q = <T extends Element = HTMLElement>(s: string) => must<T>(root, s);
  const foehnStatus = q("[data-foehn-status]");
  const foehnBody = q("[data-foehn-body]");
  const gauge = q("[data-pair-gauge]");
  const canvas = q<HTMLCanvasElement>("[data-foehn-chart]");
  const chartEmpty = q(".chart-empty");
  const searchInput = q<HTMLInputElement>("[data-weather-search]");
  const providerPills = q("[data-provider-pills]");
  const listStatus = q("[data-list-status]");
  const stationCards = q("[data-station-cards]");
  const webcamCards = q("[data-webcam-cards]");
  const modal = stationModal(root, say, () => store.state.theme);

  function writeUrl(): void {
    history.replaceState(
      history.state,
      "",
      withWeatherQuery(location.href, { tab, pair: pairId }, DEFAULT_PAIR),
    );
  }

  function renderFoehn(): void {
    const pairs = foehn?.pairs ?? [];
    const pair = pairs.find((p) => p.id === pairId) ?? pairs[0];
    if (!foehn || !pair) {
      foehnStatus.hidden = false;
      foehnStatus.textContent = say(
        foehn === undefined ? "weather.loading" : "weather.foehnUnavailable",
      );
      foehnBody.hidden = true;
      gauge.hidden = true;
      return;
    }
    foehnStatus.hidden = true;
    foehnBody.hidden = false;
    gauge.hidden = false;
    const banner = bannerClass(pair.alertLevel);
    const delta = formatDelta(pair.delta);
    gauge.className = `foehn-gauge-pill ${banner}`;
    q("[data-pair-delta]").textContent = delta;
    q("[data-pair-unit]").textContent = pair.unit;
    q("[data-pair-pills]").innerHTML = pairPillsHtml(pairs, pair.id);
    q("[data-pair-banner]").className = `foehn-banner ${banner}`;
    q("[data-pair-icon]").textContent = bannerIcon(pair.alertLevel);
    q("[data-pair-status]").textContent = pair.status || "NORMAL";
    q("[data-pair-description]").textContent = pairDescription(
      pair,
      store.state.lang,
    );
    const sides = sideKeys(pair);
    q('[data-side="first"]').textContent = say(sides.first);
    q('[data-side="second"]').textContent = say(sides.second);
    for (const [n, st] of [
      ["1", pair.station1],
      ["2", pair.station2],
    ] as const) {
      const cell = (f: string) => q(`[data-station="${n}"][data-field="${f}"]`);
      cell("name").textContent = String(st?.name ?? "");
      cell("reading").textContent = stationReading(pair, st);
      cell("altitude").textContent =
        typeof st?.altitude === "number" ? `${st.altitude} m` : "";
    }
    q("[data-pair-arrow]").textContent = `Δ = ${delta} ${pair.unit}`;
    q("[data-pair-chart-title]").textContent = say(chartTitleKey(pair.id));

    // the history belongs to the pair the report was fetched for; until a
    // switched pair's report arrives, the chart keeps the old one
    const history = foehnPair === pair.id ? foehn.history : null;
    if (history === null) return;
    const key = `${pair.id}|${store.state.theme}|${lang}|${history.length}|${history[history.length - 1]?.timestamp}`;
    if (key === chartKey) return;
    chartKey = key;
    chartEmpty.hidden = history.length > 0;
    canvas.hidden = history.length === 0;
    if (history.length === 0) {
      chart?.destroy();
      chart = null;
      return;
    }
    chart = drawChart(
      canvas,
      foehnChartConfig(
        history,
        pair,
        chartColors(store.state.theme),
        say("weather.differenceLabel"),
      ),
      chart,
    );
  }

  function renderLists(): void {
    for (const button of root.querySelectorAll<HTMLElement>(
      "[data-weather-tab]",
    )) {
      const active = button.dataset.weatherTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const pill of providerPills.querySelectorAll<HTMLElement>(
      "[data-provider]",
    ))
      pill.classList.toggle("active", pill.dataset.provider === provider);
    searchInput.placeholder = say(
      tab === "stations" ? "weather.searchStations" : "weather.searchWebcams",
    );
    providerPills.hidden = tab !== "stations";

    const shownStations = stations
      ? filterStations(stations, provider, search)
      : [];
    const shownWebcams = webcams ? filterWebcams(webcams, search) : [];
    q('[data-count="stations"]').textContent = String(shownStations.length);
    q('[data-count="providers"]').textContent = String(shownStations.length);
    q('[data-count="webcams"]').textContent = String(shownWebcams.length);

    const data = tab === "stations" ? stations : webcams;
    const shown = tab === "stations" ? shownStations : shownWebcams;
    listStatus.hidden = !!data && shown.length > 0;
    if (data === undefined) listStatus.textContent = say("weather.loading");
    else if (data === null)
      listStatus.textContent = say(
        tab === "stations"
          ? "weather.stationsUnavailable"
          : "weather.webcamsUnavailable",
      );
    else listStatus.textContent = say("weather.noMatches");

    stationCards.hidden = tab !== "stations";
    webcamCards.hidden = tab !== "webcams";
    if (tab === "stations") {
      const text = {
        wind: say("weather.wind"),
        gust: say("weather.gustShort"),
        temp: say("weather.tempShort"),
        windDirection: say("weather.windDirection"),
      };
      stationCards.innerHTML = shownStations
        .slice(0, MAX_STATIONS)
        .map((st) => stationCardHtml(st, text))
        .join("");
    } else {
      webcamCards.innerHTML = shownWebcams
        .slice(0, MAX_WEBCAMS)
        .map(webcamCardHtml)
        .join("");
    }
  }

  function render(): void {
    if (store.state.lang !== lang) {
      lang = store.state.lang;
      applyText(root, dictionary());
    }
    renderFoehn();
    renderLists();
    modal.refresh();
  }

  function selectPair(id: string): void {
    if (id === pairId) return;
    pairId = id;
    writeUrl();
    render();
    ShvApi.getFoehn(id)
      .then((report) => {
        if (pairId !== id || !report) return;
        foehn = report;
        foehnPair = id;
        render();
      })
      .catch((err: unknown) => {
        console.error("[weather] Cannot load the pair's history:", err);
      });
  }

  function activate(target: Element): void {
    const card = target.closest<HTMLElement>(
      ".station-card-item, .webcam-card-item",
    );
    if (!card) return;
    if (card.dataset.webcamId) {
      location.assign(handoffUrl({ webcam: card.dataset.webcamId }));
      return;
    }
    const st = stations?.find((s) => s.id === card.dataset.stationId);
    if (st) modal.open(st, card);
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const pair = target.closest<HTMLElement>("[data-pair-id]")?.dataset.pairId;
    if (pair) return selectPair(pair);
    const tabButton = target.closest<HTMLElement>("[data-weather-tab]");
    if (tabButton) {
      tab = tabButton.dataset.weatherTab === "webcams" ? "webcams" : "stations";
      writeUrl();
      return renderLists();
    }
    const pill =
      target.closest<HTMLElement>("[data-provider]")?.dataset.provider;
    if (pill && (PROVIDERS as readonly string[]).includes(pill)) {
      provider = pill as Provider;
      return renderLists();
    }
    activate(target);
  });
  root.addEventListener("keydown", (event) => {
    const target = event.target as Element;
    if (
      (event.key === "Enter" || event.key === " ") &&
      target.matches('[role="button"]')
    ) {
      event.preventDefault();
      activate(target);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") modal.close();
  });
  searchInput.addEventListener("input", () => {
    search = searchInput.value;
    renderLists();
  });
  // a thumbnail that fails falls back to the full image, once
  root.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
      img.src = img.dataset.fallback;
      delete img.dataset.fallback;
    },
    true,
  );

  const settle = <T>(
    label: string,
    p: Promise<T | null>,
    set: (v: T | null) => void,
  ) =>
    p
      .catch((err: unknown) => {
        console.error(`[weather] Cannot load the ${label}:`, err);
        return null;
      })
      .then((v) => {
        set(v);
        render();
      });
  settle("Foehn report", ShvApi.getFoehn(pairId), (v) => (foehn = v));
  settle(
    "measurements",
    ShvApi.getMeasurements(),
    (v) => (stations = v?.features ?? null),
  );
  settle("webcams", ShvApi.getWebcams(), (v) => (webcams = v?.webcams ?? null));

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-weather]");
if (root) mountWeather(root);
else console.error("[weather] The page has no [data-weather] root");

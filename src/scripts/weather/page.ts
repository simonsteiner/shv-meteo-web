// The weather page's behaviour over its static markup
// (src/components/weather/): the station pairs from ShvApi.getFoehn, the
// live station and webcam lists, and the station dialog (modal.ts). The
// tab and pair live in the URL (query.ts), so a link opens the same view.
// Re-renders on each store change, which is how the header's language and
// theme switches reach the page.

import type { Chart } from "chart.js";
import { store } from "../state.ts";
import { ShvApi } from "../api.ts";
import { drawChart } from "../charts/draw.ts";
import { foehnChartConfig } from "../charts/foehn.ts";
import { chartColors } from "../charts/theme.ts";
import { must } from "../dom.ts";
import { DEFAULT_PAIR } from "../foehn/pairs.ts";
import type { StationPair } from "../foehn/report.ts";
import { handoffUrl } from "../handoff.ts";
import { applyText, say as sayIn, type Dictionary } from "../i18n/text.ts";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { pairPillsHtml, stationCardHtml, webcamCardHtml } from "./cards.ts";
import { stationModal } from "./modal.ts";
import {
  chartKey,
  chartView,
  choosePair,
  initialPairState,
  reportCame,
  shownPair,
} from "./pair-state.ts";
import {
  bannerClass,
  bannerIcon,
  chartTitleKey,
  formatDelta,
  pairStatusText,
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

const dictionary = (): Dictionary => store.t;
const say = (key: string) => sayIn(dictionary(), key);

export function mountWeather(root: HTMLElement): void {
  const query = readWeatherQuery(location.search);
  let pairs = initialPairState(query.pair ?? DEFAULT_PAIR);
  let tab: WeatherTab = query.tab ?? "stations";
  let provider: Provider = "ALL";
  let search = "";
  let stations: MeasurementFeature[] | null | undefined;
  let webcams: Webcam[] | null | undefined;
  let lang: string | null = null;
  let chart: Chart | null = null;
  // what was drawn last: the chart's key and pair, and the pills
  let drawnKey = "";
  let drawnPair: string | null = null;
  let pillsHtml = "";

  const q = <T extends Element = HTMLElement>(s: string) => must<T>(root, s);
  const foehnStatus = q("[data-foehn-status]");
  const foehnRetry = q("[data-foehn-retry]");
  const foehnBody = q("[data-foehn-body]");
  const gauge = q("[data-pair-gauge]");
  const canvas = q<HTMLCanvasElement>("[data-foehn-chart]");
  const chartBox = q(".chart-canvas-container");
  const chartEmpty = q(".chart-empty");
  const searchInput = q<HTMLInputElement>("[data-weather-search]");
  const providerPills = q("[data-provider-pills]");
  const listStatus = q("[data-list-status]");
  const stationCards = q("[data-station-cards]");
  const webcamCards = q("[data-webcam-cards]");
  const modal = stationModal(
    root,
    say,
    () => store.state.theme,
    () => store.state.lang,
  );

  function writeUrl(): void {
    history.replaceState(
      history.state,
      "",
      withWeatherQuery(
        location.href,
        { tab, pair: pairs.pairId },
        DEFAULT_PAIR,
      ),
    );
  }

  function renderFoehn(): void {
    const pair = shownPair(pairs);
    if (!pairs.report || !pair) {
      foehnStatus.hidden = false;
      foehnStatus.textContent = say(
        pairs.report === undefined
          ? "weather.loading"
          : "weather.foehnUnavailable",
      );
      // a failed first report has no pills to click, so it gets a button
      foehnRetry.hidden = pairs.report === undefined;
      foehnBody.hidden = true;
      gauge.hidden = true;
      return;
    }
    foehnStatus.hidden = true;
    foehnRetry.hidden = true;
    foehnBody.hidden = false;
    gauge.hidden = false;
    const banner = bannerClass(pair.alertLevel);
    const delta = formatDelta(pair.delta);
    gauge.className = `foehn-gauge-pill ${banner}`;
    q("[data-pair-delta]").textContent = delta;
    q("[data-pair-unit]").textContent = pair.unit;
    renderPills(pairs.report.pairs, pair.id);
    q("[data-pair-banner]").className = `foehn-banner ${banner}`;
    q("[data-pair-icon]").textContent = bannerIcon(pair.alertLevel);
    const status = pairStatusText(pair, say);
    q("[data-pair-status]").textContent = status.title;
    q("[data-pair-description]").textContent = status.text;
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
        typeof st?.altitude === "number" && st.altitude > 0
          ? `${st.altitude} m`
          : "";
    }
    q("[data-pair-arrow]").textContent = `Δ = ${delta} ${pair.unit}`;
    renderChart(pair);
  }

  // The pills are rebuilt only when their content changes, and keep the
  // keyboard focus when they are.
  function renderPills(all: readonly StationPair[], selected: string): void {
    const html = pairPillsHtml(all, selected);
    if (html === pillsHtml) return;
    pillsHtml = html;
    const row = q("[data-pair-pills]");
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && row.contains(active)
        ? active.dataset.pairId
        : undefined;
    row.innerHTML = html;
    if (focused === undefined) return;
    Array.from(row.querySelectorAll<HTMLElement>("[data-pair-id]"))
      .find((el) => el.dataset.pairId === focused)
      ?.focus();
  }

  // The chart and its title change together: a switched pair's chart is
  // dimmed until its report comes, rather than shown under the new name.
  function renderChart(pair: StationPair): void {
    const view = chartView(pairs, pair.id);
    const pending = view.kind === "pending";
    chartBox.classList.toggle("is-pending", pending);
    chartBox.setAttribute("aria-busy", String(pending));
    const key = chartKey(view, store.state.theme, store.state.lang);
    if (view.kind !== "pending" && key !== drawnKey) {
      drawnKey = key;
      drawnPair = view.pairId;
      const history = view.kind === "chart" ? view.history : [];
      chartEmpty.hidden = history.length > 0;
      canvas.hidden = history.length === 0;
      if (history.length === 0) {
        chart?.destroy();
        chart = null;
      } else
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
    if (drawnPair)
      q("[data-pair-chart-title]").textContent = say(chartTitleKey(drawnPair));
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

  function loadPair(id: string): void {
    ShvApi.getFoehn(id)
      .catch((err: unknown) => {
        console.error("[weather] Cannot load the pair's report:", err);
        return null;
      })
      .then((report) => {
        // getJson has logged a failed call (null)
        pairs = reportCame(pairs, id, report);
        render();
      });
  }

  function selectPair(id: string): void {
    const next = choosePair(pairs, id);
    pairs = next.state;
    if (!next.fetch) return;
    writeUrl();
    render();
    loadPair(id);
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
    if (target.closest("[data-foehn-retry]")) return selectPair(pairs.pairId);
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
  loadPair(pairs.pairId);
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

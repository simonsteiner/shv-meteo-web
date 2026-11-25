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
import { readPick } from "../data-pick.ts";
import { must, useFallback } from "../dom.ts";
import { alertLook, formatDelta } from "../foehn/look.ts";
import { DEFAULT_PAIR } from "../foehn/pairs.ts";
import type { StationPair } from "../foehn/report.ts";
import { handoffUrl } from "../handoff.ts";
import { applyText, fill } from "../i18n/text.ts";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { swissTime } from "../foehn/pairs.ts";
import { whileVisible } from "../live/refresh.ts";
import { pairPillsHtml, stationCardHtml, webcamCardHtml } from "./cards.ts";
import { stationModal } from "./modal.ts";
import {
  chartDraw,
  chartView,
  choosePair,
  initialPairState,
  NOTHING_DRAWN,
  reportCame,
  retryButton,
  shownPair,
} from "./pair-state.ts";
import {
  chartTitleKey,
  pairStatusText,
  sideKeys,
  stationReading,
} from "./pair.ts";
import {
  readWeatherQuery,
  WEATHER_TABS,
  withWeatherQuery,
  type WeatherTab,
} from "./query.ts";
import { listView } from "./lists.ts";
import { PROVIDERS, type Provider } from "./stations.ts";

const { say } = store;

/** The sub-tab buttons' and provider pills' attributes, checked. */
const TAB_PICK = { weatherTab: WEATHER_TABS };
const PROVIDER_PICK = { provider: PROVIDERS };

function mountWeather(root: HTMLElement): void {
  const query = readWeatherQuery(location.search);
  let pairs = initialPairState(query.pair ?? DEFAULT_PAIR);
  let tab: WeatherTab = query.tab ?? "stations";
  let provider: Provider = "ALL";
  let search = "";
  let stations: MeasurementFeature[] | null | undefined;
  // when the stations were fetched, if they are the edge's stale copy
  let stationsAsOf: number | null = null;
  let webcams: Webcam[] | null | undefined;
  let lang: string | null = null;
  let chart: Chart | null = null;
  // what was drawn last: the chart, and the pills
  let drawn = NOTHING_DRAWN;
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
  const asOfNote = q("[data-stations-as-of]");
  const listMore = q("[data-list-more]");
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
      const retry = retryButton(pairs);
      foehnRetry.hidden = retry === "hidden";
      foehnRetry.setAttribute("aria-disabled", String(retry === "busy"));
      foehnBody.hidden = true;
      gauge.hidden = true;
      return;
    }
    foehnStatus.hidden = true;
    // a retry that worked hands its focus to the pair it loaded
    const retryFocused = document.activeElement === foehnRetry;
    foehnRetry.hidden = true;
    foehnBody.hidden = false;
    gauge.hidden = false;
    const look = alertLook(pair.alertLevel);
    const delta = formatDelta(pair.delta);
    gauge.className = `foehn-gauge-pill ${look.banner}`;
    q("[data-pair-delta]").textContent = delta;
    q("[data-pair-unit]").textContent = pair.unit;
    renderPills(pairs.report.pairs, pair.id);
    if (retryFocused) focusPill(pair.id);
    q("[data-pair-banner]").className = `foehn-banner ${look.banner}`;
    q("[data-pair-icon]").textContent = look.icon;
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
    if (focused !== undefined) focusPill(focused);
  }

  function focusPill(id: string): void {
    Array.from(
      q("[data-pair-pills]").querySelectorAll<HTMLElement>("[data-pair-id]"),
    )
      .find((el) => el.dataset.pairId === id)
      ?.focus();
  }

  // The chart and its title change together: a switched pair's chart is
  // dimmed until its report comes, rather than shown under the new name.
  function renderChart(pair: StationPair): void {
    const view = chartView(pairs, pair.id);
    const pending = view.kind === "pending";
    chartBox.classList.toggle("is-pending", pending);
    chartBox.setAttribute("aria-busy", String(pending));
    const next = chartDraw(view, store.state.theme, store.state.lang, drawn);
    drawn = next.drawn;
    if (next.redraw && view.kind !== "pending") {
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
    if (drawn.pairId)
      q("[data-pair-chart-title]").textContent = say(
        chartTitleKey(drawn.pairId),
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

    const view = listView({ tab, stations, webcams, provider, search });
    q('[data-count="stations"]').textContent = String(view.counts.stations);
    q('[data-count="providers"]').textContent = String(
      view.counts.allProviders,
    );
    q('[data-count="webcams"]').textContent = String(view.counts.webcams);
    asOfNote.hidden = tab !== "stations" || stationsAsOf === null;
    if (stationsAsOf !== null)
      asOfNote.textContent = fill(say("weather.asOf"), {
        time: swissTime(stationsAsOf),
      });
    listStatus.hidden = view.statusKey === null;
    if (view.statusKey) listStatus.textContent = say(view.statusKey);
    // the cards show the first matches only; the search narrows them
    listMore.hidden = view.shown >= view.matches;
    listMore.textContent = fill(say("weather.moreMatches"), {
      shown: view.shown,
      total: view.matches,
    });

    stationCards.hidden = tab !== "stations";
    webcamCards.hidden = tab !== "webcams";
    if (tab === "stations") {
      const text = {
        wind: say("weather.wind"),
        gust: say("weather.gustShort"),
        temp: say("weather.tempShort"),
        windDirection: say("weather.windDirection"),
        measuredAt: say("weather.measuredAt"),
        old: say("weather.oldMeasurement"),
      };
      // the refresh redraws the cards every 90 s: a focused card keeps focus
      const focused = stationCards.contains(document.activeElement)
        ? (document.activeElement as HTMLElement).dataset.stationId
        : undefined;
      stationCards.innerHTML = view.stations
        .map((st) => stationCardHtml(st, text))
        .join("");
      if (focused)
        stationCards
          .querySelector<HTMLElement>(
            `[data-station-id="${CSS.escape(focused)}"]`,
          )
          ?.focus();
    } else {
      webcamCards.innerHTML = view.webcams.map(webcamCardHtml).join("");
    }
  }

  function render(): void {
    if (store.state.lang !== lang) {
      lang = store.state.lang;
      applyText(root, store.t);
    }
    renderFoehn();
    renderLists();
    modal.refresh();
  }

  function loadPair(id: string): void {
    void ShvApi.getFoehn(id).then((report) => {
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
      const pick = readPick(tabButton.dataset, TAB_PICK, "weather");
      if (!pick) return;
      tab = pick.value;
      writeUrl();
      return renderLists();
    }
    const pill = target.closest<HTMLElement>("[data-provider]");
    if (pill) {
      const pick = readPick(pill.dataset, PROVIDER_PICK, "weather");
      if (!pick) return;
      provider = pick.value;
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
      if (img instanceof HTMLImageElement) useFallback(img);
    },
    true,
  );

  loadPair(pairs.pairId);
  // a failed refresh keeps the cards it has: their times show their age
  const takeMeasurements = (
    v: Awaited<ReturnType<typeof ShvApi.getMeasurements>>,
    first: boolean,
  ) => {
    if (v || first) stations = v?.features ?? null;
    if (v) {
      const fresh = ShvApi.freshness(v);
      stationsAsOf = fresh?.stale ? fresh.fetchedAt : null;
    }
    render();
  };
  // one request at a time: a refresh never starts while another, or the
  // first load, is still on its way, so an older answer can't land last
  let loading = true;
  void ShvApi.getMeasurements().then((v) => {
    loading = false;
    takeMeasurements(v, true);
  });
  // every 90 s while the page is visible and the station cards are shown
  whileVisible(() => {
    if (loading || tab !== "stations") return;
    loading = true;
    void ShvApi.getMeasurements({ fresh: true }).then((v) => {
      loading = false;
      takeMeasurements(v, false);
    });
  });
  void ShvApi.getWebcams().then((v) => {
    webcams = v?.webcams ?? null;
    render();
  });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-weather]");
if (root) mountWeather(root);
else console.error("[weather] The page has no [data-weather] root");

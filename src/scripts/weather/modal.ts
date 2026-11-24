// The station dialog on the weather page: a station's latest values and
// its recent temperature and wind, opened from a station card.

import type { Chart } from "chart.js";
import { ShvApi } from "../api.ts";
import { drawChart } from "../charts/draw.ts";
import { stationChartConfig, stationSeries } from "../charts/station.ts";
import { chartColors } from "../charts/theme.ts";
import { must } from "../dom.ts";
import { handoffUrl } from "../handoff.ts";
import type { MeasurementFeature, TimeseriesResponse } from "../types.ts";
import { stationValues, windClass } from "./stations.ts";

const DASH = "\u2013";

export interface StationModal {
  open(station: MeasurementFeature, opener: HTMLElement | null): void;
  close(): void;
  /** Redraws an open dialog after a language or theme change; does
   * nothing when neither changed. */
  refresh(): void;
  isOpen(): boolean;
}

export function stationModal(
  root: ParentNode,
  say: (key: string) => string,
  theme: () => string,
  lang: () => string,
): StationModal {
  const backdrop = must<HTMLElement>(root, "[data-station-modal]");
  const field = (name: string) =>
    must<HTMLElement>(backdrop, `[data-modal="${name}"]`);
  const canvas = must<HTMLCanvasElement>(backdrop, "[data-station-chart]");
  const closeButton = must<HTMLButtonElement>(backdrop, "[data-modal-close]");
  let station: MeasurementFeature | null = null;
  // undefined while loading, null when the station has no series
  let series: TimeseriesResponse | null | undefined;
  let chart: Chart | null = null;
  let opener: HTMLElement | null = null;
  // what the open dialog shows, so refresh() redraws only on a change
  let drawn: {
    station: MeasurementFeature;
    series: TimeseriesResponse | null | undefined;
    lang: string;
    theme: string;
  } | null = null;

  function fill(st: MeasurementFeature): void {
    drawn = { station: st, series, lang: lang(), theme: theme() };
    const p = st.properties;
    const v = stationValues(st);
    field("provider").textContent = (p.providerKey || "Meteo").toUpperCase();
    field("name").textContent = p.name || st.id;
    // upstream sends 0 for an unknown altitude
    const altitude = p.altitude
      ? `${p.altitude} ${say("weather.altitudeAsl")} · `
      : "";
    field("subtitle").textContent =
      `${altitude}ID: ${p.stationIdentifier || st.id}`;
    const wind = field("wind");
    wind.textContent = v.windKmh === null ? DASH : `${v.windKmh} km/h`;
    wind.className = `stat-val ${windClass(v.windKmh)}`;
    field("direction").textContent =
      v.dirDeg === null ? "" : `${Math.round(v.dirDeg)}°`;
    field("gust").textContent = v.gustKmh === null ? DASH : `${v.gustKmh} km/h`;
    field("temp").textContent = v.tempC === null ? DASH : `${v.tempC}°C`;
    field("dew").textContent = v.dewC === null ? DASH : `${v.dewC}°C`;
    field("humidity").textContent =
      v.humidity === null ? DASH : `${v.humidity}%`;
    field("qnh").textContent = v.qnhHpa === null ? DASH : `${v.qnhHpa} hPa`;

    const status = field("series-status");
    const box = field("chart-box");
    const data = series ? stationSeries(series) : null;
    if (!data || data.labels.length === 0) {
      chart?.destroy();
      chart = null;
      box.hidden = true;
      status.hidden = false;
      status.textContent = say(
        series === undefined
          ? "weather.loadingSeries"
          : "weather.seriesUnavailable",
      );
      return;
    }
    status.hidden = true;
    box.hidden = false;
    chart = drawChart(
      canvas,
      stationChartConfig(data, chartColors(theme()), {
        temp: say("weather.seriesTemp"),
        dew: say("weather.seriesDew"),
        wind: say("weather.seriesWind"),
      }),
      chart,
    );
  }

  function close(): void {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    chart?.destroy();
    chart = null;
    // a language or theme change rebuilds the cards, so the card that opened
    // the dialog may be gone: focus its replacement
    const id = station?.id;
    const back = opener?.isConnected
      ? opener
      : Array.from(
          root.querySelectorAll<HTMLElement>("[data-station-id]"),
        ).find((el) => el.dataset.stationId === id);
    station = null;
    drawn = null;
    back?.focus();
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  closeButton.addEventListener("click", close);
  must<HTMLButtonElement>(backdrop, "[data-view-on-map]").addEventListener(
    "click",
    () => {
      if (station) location.assign(handoffUrl({ station: station.id }));
    },
  );

  return {
    open(st, from) {
      station = st;
      series = undefined;
      opener = from;
      backdrop.hidden = false;
      fill(st);
      closeButton.focus();
      ShvApi.getStationTimeseries(st.id)
        .then((ts) => {
          if (station !== st) return;
          series = ts;
          fill(st);
        })
        .catch((err: unknown) => {
          console.error("[weather] Cannot load the station's series:", err);
          if (station !== st) return;
          series = null;
          fill(st);
        });
    },
    close,
    refresh() {
      if (!station) return;
      if (
        drawn?.station === station &&
        drawn.series === series &&
        drawn.lang === lang() &&
        drawn.theme === theme()
      )
        return;
      fill(station);
    },
    isOpen: () => !backdrop.hidden,
  };
}

// A station's recent temperature and wind as a two-axis Chart.js line. The
// two series are joined on their timestamps, so a gap in one doesn't shift
// the other.

import type { ChartConfiguration } from "chart.js";
import type { TimeseriesResponse } from "../types.ts";
import { round1, toCelsius } from "../units.ts";
import type { ChartColors } from "./theme.ts";

export interface StationSeries {
  /** HH:MM in the browser's time zone. */
  labels: string[];
  tempC: (number | null)[];
  windKmh: (number | null)[];
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The temperature (°C) and wind (km/h) series on one time axis; null
 * where a series has no value. Empty when the station sends neither. */
export function stationSeries(ts: TimeseriesResponse | null): StationSeries {
  const values = (parameter: string, convert: (v: number) => number | null) => {
    const byTime = new Map<number, number | null>();
    const s = ts?.timeseries?.find((t) => t.parameter === parameter);
    for (const m of s?.measurements ?? []) {
      const v = m.value === null ? null : convert(m.value);
      byTime.set(m.time, v === null ? null : round1(v));
    }
    return byTime;
  };
  const temp = values("temperature", toCelsius);
  const wind = values("wind_speed", (v) => v);
  const times = Array.from(new Set([...temp.keys(), ...wind.keys()])).sort(
    (a, b) => a - b,
  );
  return {
    labels: times.map(hhmm),
    tempC: times.map((t) => temp.get(t) ?? null),
    windKmh: times.map((t) => wind.get(t) ?? null),
  };
}

export function stationChartConfig(
  series: StationSeries,
  colors: ChartColors,
  labels: { temp: string; wind: string },
): ChartConfiguration<"line", (number | null)[], string> {
  return {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [
        {
          label: labels.temp,
          data: series.tempC,
          borderColor: "#EF4444",
          backgroundColor: "transparent",
          borderWidth: 2,
          tension: 0.3,
          yAxisID: "yTemp",
          pointRadius: 1.5,
        },
        {
          label: labels.wind,
          data: series.windKmh,
          borderColor: "#0089CF",
          backgroundColor: "rgba(0, 137, 207, 0.1)",
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          yAxisID: "yWind",
          pointRadius: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, maxTicksLimit: 8 },
        },
        yTemp: {
          type: "linear",
          position: "left",
          grid: { color: colors.grid },
          ticks: { color: colors.text, callback: (v) => `${v}°C` },
        },
        yWind: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#0089CF", callback: (v) => `${v} km/h` },
        },
      },
    },
  };
}

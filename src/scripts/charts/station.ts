// A station's recent temperature, dew point and wind as a two-axis Chart.js
// line. The series are joined on their timestamps, so a gap in one doesn't
// shift the others. The gap between temperature and dew point gives a rough
// cloud base; a station that reports no dew point gets no dew point line.

import type { ChartConfiguration } from "chart.js";
import type { TimeseriesResponse } from "../types.ts";
import { swissTime } from "../swiss-time.ts";
import { round1, toCelsius } from "../units.ts";
import type { ChartColors } from "./theme.ts";

export interface StationSeries {
  /** HH:MM in Swiss time. */
  labels: string[];
  tempC: (number | null)[];
  /** All null when the station sends no dew point. */
  dewC: (number | null)[];
  windKmh: (number | null)[];
}

/** The temperature and dew point (°C) and wind (km/h) series on one time
 * axis; null where a series has no value. Empty when the station sends
 * none of them. */
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
  const dew = values("dew_point", toCelsius);
  const wind = values("wind_speed", (v) => v);
  const times = Array.from(
    new Set([...temp.keys(), ...dew.keys(), ...wind.keys()]),
  ).sort((a, b) => a - b);
  return {
    labels: times.map(swissTime),
    tempC: times.map((t) => temp.get(t) ?? null),
    dewC: times.map((t) => dew.get(t) ?? null),
    windKmh: times.map((t) => wind.get(t) ?? null),
  };
}

/** The chart's config; the dew point line, dashed on the temperature axis,
 * only when the station reports a dew point. Gaps stay gaps (Chart.js
 * leaves `spanGaps` off). */
export function stationChartConfig(
  series: StationSeries,
  colors: ChartColors,
  labels: { temp: string; dew: string; wind: string },
): ChartConfiguration<"line", (number | null)[], string> {
  const dew = series.dewC.some((v) => v !== null)
    ? [
        {
          label: labels.dew,
          data: series.dewC,
          borderColor: "#10B981",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.3,
          yAxisID: "yTemp",
          pointRadius: 0,
        },
      ]
    : [];
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
        ...dew,
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

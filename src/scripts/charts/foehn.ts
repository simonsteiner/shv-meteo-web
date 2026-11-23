// The station pair's 24-hour difference as a Chart.js line: blue for a
// pressure pair, purple for the temperature pair, the zero line drawn
// stronger.

import type { ChartConfiguration } from "chart.js";
import type { HistoryPoint } from "../foehn/pairs.ts";
import { signed, type ChartColors } from "./theme.ts";

export function foehnChartConfig(
  history: readonly HistoryPoint[],
  pair: { isPressure: boolean; unit: string },
  colors: ChartColors,
  label: string,
): ChartConfiguration<"line", number[], string> {
  const line = pair.isPressure ? "#0089CF" : "#A855F7";
  const area = pair.isPressure
    ? "rgba(0, 137, 207, 0.14)"
    : "rgba(168, 85, 247, 0.14)";
  return {
    type: "line",
    data: {
      labels: history.map((h) => h.time),
      datasets: [
        {
          label: `${label} (${pair.unit})`,
          data: history.map((h) => h.diffHpa),
          borderColor: line,
          backgroundColor: area,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: history.length > 50 ? 0 : 2.5,
          pointHoverRadius: 6,
          pointHitRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${label}: ${signed(ctx.parsed.y ?? 0)} ${pair.unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: {
            color: colors.text,
            maxTicksLimit: 8,
            maxRotation: 0,
            autoSkip: true,
          },
        },
        y: {
          grid: {
            color: (ctx) =>
              ctx.tick.value === 0 ? colors.zeroLine : colors.grid,
            lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.5 : 1),
          },
          ticks: {
            color: colors.text,
            callback: (v) => `${signed(Number(v))} ${pair.unit}`,
          },
        },
      },
    },
  };
}

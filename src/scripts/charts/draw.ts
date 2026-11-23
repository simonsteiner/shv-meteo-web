// Draws a chart configuration on a canvas. Only the Chart.js parts the
// line charts use are registered, so the chartjs chunk stays small.

import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartType,
} from "chart.js";

Chart.register(
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

/** The chart drawn on `canvas`, after destroying `previous`. */
export function drawChart<T extends ChartType>(
  canvas: HTMLCanvasElement,
  config: ChartConfiguration<T>,
  previous: Chart | null,
): Chart {
  previous?.destroy();
  return new Chart(canvas, config as ChartConfiguration);
}

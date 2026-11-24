// The map's data sets that failed to load, said on the map rather than
// only in the console: each counts while a layer it fills is shown.

import { fill, type Say } from "../i18n/text.ts";
import type { Layers } from "../settings.ts";

/** The data sets the map page loads itself, in the order they are named. */
export const DATASETS = [
  "sites",
  "airspaces",
  "wildlife",
  "measurements",
  "foehn",
  "webcams",
] as const;
export type Dataset = (typeof DATASETS)[number];

/** The layers each data set fills. */
const FILLS: Record<Dataset, (keyof Layers)[]> = {
  sites: ["launches", "landings", "landingPatterns"],
  airspaces: ["airspace"],
  wildlife: ["wildschutz"],
  measurements: ["stations"],
  foehn: ["foehnAxis"],
  webcams: ["webcams"],
};

/** The failed data sets a shown layer needs, in DATASETS order. */
export function failedShown(
  failed: ReadonlySet<Dataset>,
  layers: Layers,
): Dataset[] {
  return DATASETS.filter(
    (d) => failed.has(d) && FILLS[d].some((key) => layers[key]),
  );
}

/** The status line for `datasets`, "" when there are none. */
export function loadStatusText(datasets: readonly Dataset[], say: Say): string {
  if (datasets.length === 0) return "";
  const names = datasets.map((d) => say(`map.dataset.${d}`)).join(", ");
  return fill(say("map.loadFailed"), { names });
}

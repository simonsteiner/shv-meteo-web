// The map page's session: what has loaded, what failed, which handoff to
// take and what a store change makes the page redraw. The page applies the
// answers to Leaflet and the DOM; this module never imports the store,
// Leaflet, the DOM or ShvApi, so its load-order rules are tested alone.
//
// - Each data set arrives through `settle`, or fails there (a null answer,
//   or a throw while drawing it, logged). A failed data set is said on the
//   map while a layer it fills is shown; the obstacles load as the map
//   moves, so they count until a load succeeds.
// - A selection handed over in the URL is taken once, from the first data
//   set of its kind that arrives.
// - `plan` answers what to redraw for a store state: the words and Foehn
//   badges on a language switch, the flying sites on a search, wind filter,
//   language change or new data, the stations when shown or switched, the
//   obstacles when shown or hidden, the sheet on a new selection or
//   language. Everything else (layers on and off, the base map) is cheap
//   and applied on every change.

import { fill, type Say } from "../i18n/text.ts";
import type { Handoff } from "../handoff.ts";
import type { Layers, MeteoMode } from "../settings.ts";
import type { Selection } from "../sheet/render.ts";
import type { State } from "../state.ts";
import type { LatLngTuple } from "./centroid.ts";
import {
  findHandoff,
  type HandoffTarget,
  type Loaded,
} from "./handoff-target.ts";

/** The data sets the map page loads itself, in the order they are named. */
export const DATASETS = [
  "sites",
  "airspaces",
  "wildlife",
  "measurements",
  "foehn",
  "webcams",
  "obstacles",
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
  obstacles: ["obstacles"],
};

export interface Redraws {
  /** The page's words and the Foehn badges' pair names. */
  text: boolean;
  sites: boolean;
  stations: boolean;
  obstacles: "load" | "clear" | null;
  sheet: boolean;
}

export interface Plan {
  redraw: Redraws;
  /** The load-failure line, "" when there is none. */
  status: string;
  /** Where to centre on a new pilot fix, with the `?z` zoom for the first
   * `?locate` fix only; null when the fix is not new. */
  pilot: { at: LatLngTuple; zoom: number | null } | null;
}

/** What the map drew last. */
interface Drawn {
  lang: string | null;
  /** The search, wind filter and language the sites were drawn for; ""
   * redraws them (new data). */
  sites: string;
  /** The mode the stations were drawn in; null while they are hidden. */
  stationsMode: MeteoMode | null;
  obstacles: boolean;
  selection: Selection | null;
}

const NOTHING_DRAWN: Drawn = {
  lang: null,
  sites: "",
  stationsMode: null,
  obstacles: false,
  selection: null,
};

type MapState = Pick<
  State,
  | "lang"
  | "searchQuery"
  | "windFilter"
  | "layers"
  | "meteoMode"
  | "pilotLocation"
  | "pilotFix"
>;

export interface MapSession {
  /** A data set's answer: null (the call failed) or its data, which `use`
   * draws and may return as the items a handoff searches. A null answer or
   * a throw from `use` (logged with `label`) fails the data set. Answers
   * the handed-over selection when this data set holds it, once. */
  settle<T>(
    dataset: Dataset,
    data: T | null,
    label: string,
    use: (data: T) => Loaded | void,
  ): HandoffTarget | null;
  /** The obstacle layer's last load went `bad` or not; answers whether the
   * failed set changed. */
  obstacles(bad: boolean): boolean;
  /** What to redraw for `state`; call once per render. */
  plan(state: MapState, selection: Selection | null): Plan;
  /** The `?locate` fix ended, found or not: `?z` no longer applies. */
  locateEnded(): void;
}

export function createMapSession(opts: {
  handoff: Handoff | null;
  zoom: number | null;
  say: Say;
}): MapSession {
  const { handoff, say } = opts;
  const failed = new Set<Dataset>();
  let drawn = NOTHING_DRAWN;
  let taken = false;
  let pilotFix = 0;
  // ?z sets the zoom of a ?locate handoff only, and only once, so the
  // header's GPS button later keeps the zoom
  let locateZoom = handoff && "locate" in handoff ? opts.zoom : null;

  function fail(dataset: Dataset): null {
    failed.add(dataset);
    return null;
  }

  function takeHandoff(loaded: Loaded): HandoffTarget | null {
    // a stale id is logged by findHandoff and still consumes the handoff
    if (taken || !handoff || !(loaded.kind in handoff)) return null;
    taken = true;
    return findHandoff(handoff, loaded);
  }

  function status(layers: Layers): string {
    const names = DATASETS.filter(
      (d) => failed.has(d) && FILLS[d].some((key) => layers[key]),
    ).map((d) => say(`map.dataset.${d}`));
    return names.length === 0
      ? ""
      : fill(say("map.loadFailed"), { names: names.join(", ") });
  }

  return {
    settle(dataset, data, label, use) {
      if (!data) return fail(dataset);
      let loaded: Loaded | void;
      try {
        loaded = use(data);
      } catch (err) {
        console.error(label, err);
        return fail(dataset);
      }
      if (dataset === "sites") drawn = { ...drawn, sites: "" };
      return loaded ? takeHandoff(loaded) : null;
    },

    obstacles(bad) {
      if (bad === failed.has("obstacles")) return false;
      if (bad) failed.add("obstacles");
      else failed.delete("obstacles");
      return true;
    },

    plan(state, selection) {
      const sites = `${state.searchQuery}|${state.windFilter.join(",")}|${state.lang}`;
      // hidden stations aren't redrawn as the map moves, so showing them
      // draws them afresh
      const stationsMode = state.layers.stations ? state.meteoMode : null;
      const sameSelection =
        selection?.kind === drawn.selection?.kind &&
        selection?.value === drawn.selection?.value;
      let obstacles: Redraws["obstacles"] = null;
      if (state.layers.obstacles !== drawn.obstacles)
        obstacles = state.layers.obstacles ? "load" : "clear";
      const redraw: Redraws = {
        text: state.lang !== drawn.lang,
        sites: sites !== drawn.sites,
        stations: stationsMode !== null && stationsMode !== drawn.stationsMode,
        obstacles,
        sheet: !sameSelection || state.lang !== drawn.lang,
      };
      drawn = {
        lang: state.lang,
        sites,
        stationsMode,
        obstacles: state.layers.obstacles,
        selection,
      };
      // each new position, from the GPS button or ?locate, centres the map
      let pilot: Plan["pilot"] = null;
      const at = state.pilotLocation;
      if (at && state.pilotFix !== pilotFix) {
        pilotFix = state.pilotFix;
        pilot = { at: [at.lat, at.lng], zoom: locateZoom };
        locateZoom = null;
      }
      return { redraw, status: status(state.layers), pilot };
    },

    locateEnded() {
      locateZoom = null;
    },
  };
}

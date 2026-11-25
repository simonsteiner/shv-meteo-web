// What a store change makes the map redraw: the page's words and Foehn
// badges on a language switch, the flying sites on a search, wind filter or
// language change, the stations when they are shown or switch mode, the
// obstacles when shown or hidden, and the sheet on a new selection or
// language. Everything else (layers on and off, the base map) is cheap and
// applied on every change.

import type { Selection } from "../sheet/render.ts";
import type { State } from "../state.ts";
import type { MeteoMode } from "../settings.ts";

/** What the map drew last. */
export interface Drawn {
  lang: string | null;
  /** The search, wind filter and language the sites were drawn for; ""
   * redraws them (new data). */
  sites: string;
  /** The mode the stations were drawn in; null while they are hidden. */
  stationsMode: MeteoMode | null;
  obstacles: boolean;
  selection: Selection | null;
}

export const NOTHING_DRAWN: Drawn = {
  lang: null,
  sites: "",
  stationsMode: null,
  obstacles: false,
  selection: null,
};

export interface Redraws {
  /** The page's words and the Foehn badges' pair names. */
  text: boolean;
  sites: boolean;
  stations: boolean;
  obstacles: "load" | "clear" | null;
  sheet: boolean;
}

type MapState = Pick<
  State,
  "lang" | "searchQuery" | "windFilter" | "layers" | "meteoMode"
>;

export function redraws(
  drawn: Drawn,
  state: MapState,
  selection: Selection | null,
): { redraw: Redraws; drawn: Drawn } {
  const sites = `${state.searchQuery}|${state.windFilter.join(",")}|${state.lang}`;
  // hidden stations aren't redrawn as the map moves, so showing them draws
  // them afresh
  const stationsMode = state.layers.stations ? state.meteoMode : null;
  const sameSelection =
    selection?.kind === drawn.selection?.kind &&
    selection?.value === drawn.selection?.value;
  let obstacles: Redraws["obstacles"] = null;
  if (state.layers.obstacles !== drawn.obstacles)
    obstacles = state.layers.obstacles ? "load" : "clear";
  return {
    redraw: {
      text: state.lang !== drawn.lang,
      sites: sites !== drawn.sites,
      stations: stationsMode !== null && stationsMode !== drawn.stationsMode,
      obstacles,
      sheet: !sameSelection || state.lang !== drawn.lang,
    },
    drawn: {
      lang: state.lang,
      sites,
      stationsMode,
      obstacles: state.layers.obstacles,
      selection,
    },
  };
}

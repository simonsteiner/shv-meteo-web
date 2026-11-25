// What the map's controls show for the store's state: the search field and
// its clear button, the filter pills, the wind compass's count and reset,
// which drawer buttons are pressed and the DABS link. page.ts applies it.

import { fill, type Say } from "../i18n/text.ts";
import type { State } from "../state.ts";

type ControlState = Pick<
  State,
  "searchQuery" | "windFilter" | "meteoMode" | "baseMap" | "mapCategory"
>;

export interface ControlsView {
  search: string;
  /** The clear button and the search pill. */
  searchShown: boolean;
  searchPillText: string;
  /** The wind pill, the compass's count badge and its reset button. */
  windShown: boolean;
  windCount: number;
  windPillText: string;
  windResetLabel: string;
  /** The row the filter pills sit in. */
  pillsShown: boolean;
  /** The DABS link, under the airspace tab. */
  dabsShown: boolean;
}

export function controlsView(state: ControlState, say: Say): ControlsView {
  const search = state.searchQuery;
  const wind = state.windFilter;
  const dirs = wind.join(", ");
  return {
    search,
    searchShown: search !== "",
    searchPillText: `"${search}"`,
    windShown: wind.length > 0,
    windCount: wind.length,
    windPillText: fill(say("map.windPill"), { dirs }),
    windResetLabel: fill(say("map.resetWind"), { dirs }),
    pillsShown: search !== "" || wind.length > 0,
    dabsShown: state.mapCategory === "AIRSPACE",
  };
}

/** The drawer's toggle buttons, by the data attribute that names their
 * value (`data-wind="NW"`, `data-meteo-mode="WIND"`, ...). */
export type Control = "wind" | "meteoMode" | "base" | "mapCategory";

/** Whether the button for `value` of `control` is pressed. */
export function pressed(
  state: ControlState,
  control: Control,
  value: string | undefined,
): boolean {
  if (value === undefined) return false;
  if (control === "wind")
    return (state.windFilter as readonly string[]).includes(value);
  if (control === "meteoMode") return state.meteoMode === value;
  if (control === "base") return state.baseMap === value;
  return state.mapCategory === value;
}

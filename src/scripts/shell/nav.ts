// Whether a click on the Map link resets the map, kept pure so it can be
// tested.

import type { Tab } from "../app-state.ts";

/** The parts of a click that decide whether it stays on this page. */
export interface LinkClick {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Whether a click on the Map link resets the map (clears the wind filter):
 * only a plain primary click on the map. A modified or middle click opens
 * a new tab or window and leaves this map as it is.
 */
export function resetsMap(click: LinkClick, activeTab: Tab): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey)
    return false;
  return activeTab === "map";
}

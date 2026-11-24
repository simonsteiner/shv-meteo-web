// The tab links' two decisions, kept pure so they can be tested: how a link
// marks the current tab, and whether a click on the Map link resets the map.

import type { Tab } from "../app-state.ts";

/**
 * The tab link's `aria-current`: "page" on the tab's own URL, "true" on a
 * section of it (`/forecast/emagram/` for the Forecast link), else none.
 */
export function tabCurrent(
  tab: Tab,
  view: Tab,
  pathname: string,
): "page" | "true" | undefined {
  if (tab !== view) return undefined;
  const path = pathname.replace(/index\.html$/, "").replace(/\/?$/, "/");
  return path === `/${tab}/` ? "page" : "true";
}

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

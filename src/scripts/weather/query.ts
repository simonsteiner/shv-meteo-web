// The weather page's deep link: `/weather/?tab=webcams&pair=GVE_GUT` opens
// the webcams list with that station pair's history. Unknown values are
// ignored, so an old or mistyped link still opens the page.

import { DEFAULT_PAIR, PAIRS } from "../foehn/pairs.ts";

export const WEATHER_TABS = ["stations", "webcams"] as const;
export type WeatherTab = (typeof WEATHER_TABS)[number];

export interface WeatherQuery {
  tab: WeatherTab | null;
  /** A station pair id from foehn/pairs.ts. */
  pair: string | null;
}

export function readWeatherQuery(search: string): WeatherQuery {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const pair = params.get("pair");
  return {
    tab: WEATHER_TABS.includes(tab as WeatherTab) ? (tab as WeatherTab) : null,
    pair: PAIRS.some((p) => p.id === pair) ? pair : null,
  };
}

/** The weather page's URL opening `pair` (a badge on the map's Foehn
 * layer links there); an unknown or the default pair opens the page as is. */
export function weatherUrl(pair: string): string {
  const known = PAIRS.some((p) => p.id === pair);
  return known && pair !== DEFAULT_PAIR
    ? `/weather/?pair=${encodeURIComponent(pair)}`
    : "/weather/";
}

/** `href`'s path and query with the page's state written in, any other
 * parameter and the hash kept; the default tab and pair are left out. */
export function withWeatherQuery(
  href: string,
  state: { tab: WeatherTab; pair: string },
  defaultPair: string,
): string {
  const url = new URL(href);
  if (state.tab === "stations") url.searchParams.delete("tab");
  else url.searchParams.set("tab", state.tab);
  if (state.pair === defaultPair) url.searchParams.delete("pair");
  else url.searchParams.set("pair", state.pair);
  return url.pathname + url.search + url.hash;
}

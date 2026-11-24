// What the weather page's live lists show for the tab, provider and search:
// the counts on the tabs and the "all" pill, the status line, the cards
// (the first few matches) and how many matches the cards leave out.

import type { MeasurementFeature, Webcam } from "../types.ts";
import { filterStations, type Provider } from "./stations.ts";
import { filterWebcams } from "./webcams.ts";
import type { WeatherTab } from "./query.ts";

/** How many cards a list shows, as the old view did. */
export const MAX_STATIONS = 48;
export const MAX_WEBCAMS = 36;

export interface ListInput {
  tab: WeatherTab;
  /** undefined while loading, null when the call failed. */
  stations: readonly MeasurementFeature[] | null | undefined;
  webcams: readonly Webcam[] | null | undefined;
  provider: Provider;
  search: string;
}

export interface ListView {
  counts: {
    /** The stations of the provider that match the search. */
    stations: number;
    /** The stations of every provider that match the search. */
    allProviders: number;
    webcams: number;
  };
  /** The status line's dictionary key; null when cards show. */
  statusKey: string | null;
  stations: MeasurementFeature[];
  webcams: Webcam[];
  /** The tab's matches and how many of them the cards show. */
  matches: number;
  shown: number;
}

export function listView(input: ListInput): ListView {
  const { tab, provider, search } = input;
  const stations = input.stations
    ? filterStations(input.stations, provider, search)
    : [];
  const allProviders = input.stations
    ? provider === "ALL"
      ? stations.length
      : filterStations(input.stations, "ALL", search).length
    : 0;
  const webcams = input.webcams ? filterWebcams(input.webcams, search) : [];

  const data = tab === "stations" ? input.stations : input.webcams;
  const matches = tab === "stations" ? stations.length : webcams.length;
  let statusKey: string | null = null;
  if (data === undefined) statusKey = "weather.loading";
  else if (data === null)
    statusKey =
      tab === "stations"
        ? "weather.stationsUnavailable"
        : "weather.webcamsUnavailable";
  else if (matches === 0) statusKey = "weather.noMatches";

  const shownStations = stations.slice(0, MAX_STATIONS);
  const shownWebcams = webcams.slice(0, MAX_WEBCAMS);
  return {
    counts: {
      stations: stations.length,
      allProviders,
      webcams: webcams.length,
    },
    statusKey,
    stations: shownStations,
    webcams: shownWebcams,
    matches,
    shown: tab === "stations" ? shownStations.length : shownWebcams.length,
  };
}

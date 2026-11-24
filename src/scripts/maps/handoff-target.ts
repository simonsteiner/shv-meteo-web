// What a selection handed to the map in its URL (src/scripts/handoff.ts)
// becomes once its data has loaded: the selection for the sheet, where the
// map goes, and the layers it turns on so the handed-over marker shows.

import type { Handoff } from "../handoff.ts";
import type { Selection } from "../sheet/render.ts";
import type { Layers, MeteoMode } from "../settings.ts";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  Webcam,
} from "../types.ts";
import { featureLatLng, type LatLngTuple } from "./centroid.ts";
import { findSite } from "./sites.ts";
import { stationLatLng } from "./stations.ts";
import { webcamLatLng } from "./webcams.ts";

/** One data set as it arrives, by the kind of selection it holds. */
export type Loaded =
  | { kind: "site"; items: readonly FlyingSiteFeature[] }
  | { kind: "station"; items: readonly MeasurementFeature[] }
  | { kind: "webcam"; items: readonly Webcam[] };

export interface HandoffTarget {
  selection: Selection;
  /** Where it is; null when it has no position. */
  at: LatLngTuple | null;
}

/** The selection `handoff` names in `loaded`, else null: when it names
 * another kind, or nothing in `loaded` (logged, as a stale link). */
export function findHandoff(
  handoff: Handoff | null,
  loaded: Loaded,
): HandoffTarget | null {
  if (!handoff) return null;
  let target: HandoffTarget | null = null;
  let id: string;
  if (loaded.kind === "site") {
    if (!("site" in handoff)) return null;
    id = handoff.site;
    const value = findSite(loaded.items, id);
    if (value)
      target = { selection: { kind: "site", value }, at: featureLatLng(value) };
  } else if (loaded.kind === "station") {
    if (!("station" in handoff)) return null;
    id = handoff.station;
    const value = loaded.items.find((f) => f.id === id);
    if (value)
      target = {
        selection: { kind: "station", value },
        at: stationLatLng(value),
      };
  } else {
    if (!("webcam" in handoff)) return null;
    id = handoff.webcam;
    const value = loaded.items.find((w) => w.identifier === id);
    if (value)
      target = {
        selection: { kind: "webcam", value },
        at: webcamLatLng(value),
      };
  }
  if (!target)
    console.error(`[maps.handoff] Handed-over ${loaded.kind} not found: ${id}`);
  return target;
}

/** What to turn on so a handed-over `kind` shows on the map: the meteo
 * mode for a station (wind, unless temperature is shown) or a webcam, the
 * take-off and landing layers for a site. Empty when it shows already. */
export function revealFor(
  kind: Selection["kind"],
  state: { layers: Layers; meteoMode: MeteoMode },
): { meteoMode: MeteoMode | null; layers: (keyof Layers)[] } {
  if (kind === "station")
    return {
      meteoMode: state.layers.stations
        ? null
        : state.meteoMode === "TEMPERATURE"
          ? "TEMPERATURE"
          : "WIND",
      layers: [],
    };
  if (kind === "webcam")
    return {
      meteoMode: state.layers.webcams ? null : "WEBCAM",
      layers: [],
    };
  if (kind === "site")
    return {
      meteoMode: null,
      layers: (["launches", "landings"] as const).filter(
        (key) => !state.layers[key],
      ),
    };
  return { meteoMode: null, layers: [] };
}

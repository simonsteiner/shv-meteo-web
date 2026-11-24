// The airspace and wildlife-zone layers. Popups are built when they open,
// so they come in the language shown then (`say` reads the store's).

import L from "leaflet";
import type { Say } from "../i18n/text.ts";
import {
  WILDLIFE_STYLE,
  airspacePopupHtml,
  airspaceStyle,
  wildlifePopupHtml,
} from "./airspace.ts";

type Props = Record<string, unknown>;

function props(feature: GeoJSON.Feature | undefined): Props {
  return (feature?.properties ?? {}) as Props;
}

export function zoneLayers(say: Say): {
  airspace: L.GeoJSON;
  wildlife: L.GeoJSON;
} {
  const airspace = L.geoJSON(undefined, {
    style: (f) => {
      const p = props(f);
      return airspaceStyle(p.type, p.inactiveByAgreement);
    },
    onEachFeature: (f, layer) =>
      layer.bindPopup(() => airspacePopupHtml(props(f), say), {
        maxWidth: 300,
      }),
  });
  const wildlife = L.geoJSON(undefined, {
    style: WILDLIFE_STYLE,
    onEachFeature: (f, layer) =>
      layer.bindPopup(() => wildlifePopupHtml(props(f), say), {
        maxWidth: 280,
      }),
  });
  return { airspace, wildlife };
}

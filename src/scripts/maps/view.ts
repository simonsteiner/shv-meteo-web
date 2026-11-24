// The Leaflet map itself: its default view, zoom buttons and base layers.

import L from "leaflet";
import type { BaseMap } from "../settings.ts";
import {
  BASE_LAYERS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  baseMapKey,
} from "./basemap.ts";

export interface MapView {
  map: L.Map;
  /** Shows `key`'s tiles, replacing the base layer shown. */
  setBaseMap(key: BaseMap): void;
}

export function createMap(
  el: HTMLElement,
  baseMap: BaseMap,
  zoom: number | null,
): MapView {
  const map = L.map(el, {
    center: DEFAULT_CENTER,
    zoom: zoom ?? DEFAULT_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    preferCanvas: true,
  });
  // bottom right, clear of the search bar and the header
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const layers = new Map<BaseMap, L.TileLayer>();
  let current: L.TileLayer | null = null;
  function setBaseMap(key: BaseMap): void {
    const k = baseMapKey(key);
    let layer = layers.get(k);
    if (!layer) {
      const spec = BASE_LAYERS[k];
      layer = L.tileLayer(spec.url, {
        attribution: spec.attribution,
        maxZoom: spec.maxZoom,
        maxNativeZoom: spec.maxNativeZoom,
        bounds: spec.bounds,
      });
      layers.set(k, layer);
    }
    if (layer === current) return;
    if (current) map.removeLayer(current);
    current = layer.addTo(map);
  }
  setBaseMap(baseMap);

  // the container gets its size from the page's CSS after the first frame
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 200);
  return { map, setBaseMap };
}

/** Clicks on `layer` run `fn` and stop there, so the map's own click (which
 * clears the selection) doesn't follow. */
export function onPick(layer: L.Layer, fn: () => void): void {
  layer.on("click", (e) => {
    L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);
    fn();
  });
}

/** Shows or hides `layer` on `map`. */
export function showLayer(map: L.Map, layer: L.Layer, visible: boolean): void {
  if (visible && !map.hasLayer(layer)) map.addLayer(layer);
  else if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
}

/** A div icon of `size`, anchored at its centre. */
export function centredIcon(
  className: string,
  html: string,
  size: [number, number],
): L.DivIcon {
  return L.divIcon({
    className,
    html,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
  });
}

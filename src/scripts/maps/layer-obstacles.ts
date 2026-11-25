// The BAZL obstacle layer on a canvas: loads the obstacles of the view
// (padded by a fifth) as it moves, draws each once, starts over when the
// zoom crosses a whole level, and drops far-off ones when too many pile up.

import L from "leaflet";
import { ShvApi } from "../api.ts";
import type { ObstacleFeature } from "../types.ts";
import {
  OBSTACLE_MIN_ZOOM,
  OBSTACLE_PRUNE_AT,
  obstacleKey,
  obstaclePathStyle,
  obstaclePointStyle,
} from "./obstacles.ts";
import { onPick } from "./view.ts";

export interface ObstacleLayer {
  layer: L.GeoJSON;
  /** Loads and draws the view's obstacles. */
  update(): Promise<void>;
  /** Stops loading and empties the layer. */
  clear(): void;
}

/** `onLoad` hears after each load whether it failed, so the page can say
 * so: an empty hazard layer must not read as no hazards. */
export function obstacleLayer(
  map: L.Map,
  pick: (f: ObstacleFeature) => void,
  onLoad: (failed: boolean) => void,
): ObstacleLayer {
  const renderer = L.canvas({ padding: 0.5 });
  const drawn = new Map<string, { layer: L.Layer; at: L.LatLng | null }>();
  let lastLevel: number | null = null;
  let request: AbortController | null = null;

  const layer = L.geoJSON(undefined, {
    // the layer's own options reach every path it makes, markers included
    ...({ renderer } as L.GeoJSONOptions),
    pointToLayer: (f, at) => {
      const style = obstaclePointStyle(
        (f as ObstacleFeature).properties ?? {},
        map.getZoom(),
      );
      return style.kind === "circle"
        ? L.circleMarker(at, { ...style, renderer })
        : L.marker(at, {
            icon: L.icon({
              iconUrl: style.url,
              iconSize: style.size,
              iconAnchor: style.anchor,
              className: "obstacle-marker-icon",
            }),
          });
    },
    style: (f) => {
      const style = f ? obstaclePathStyle(f as ObstacleFeature) : null;
      return style
        ? { ...style, lineJoin: "round", lineCap: "round", renderer }
        : { renderer };
    },
    onEachFeature: (f, l) => {
      const feature = f as ObstacleFeature;
      const at =
        l instanceof L.Marker || l instanceof L.CircleMarker
          ? l.getLatLng()
          : "getBounds" in l
            ? (l as L.Polyline).getBounds().getCenter()
            : null;
      drawn.set(obstacleKey(feature), { layer: l, at });
      onPick(l, () => pick(feature));
    },
  });

  function clear(): void {
    request?.abort();
    request = null;
    layer.clearLayers();
    drawn.clear();
  }

  async function update(): Promise<void> {
    const zoom = map.getZoom();
    if (zoom < OBSTACLE_MIN_ZOOM) {
      // none are shown this far out, so none are missing
      clear();
      onLoad(false);
      return;
    }
    const level = Math.floor(zoom);
    if (lastLevel !== null && level !== lastLevel) clear();
    lastLevel = level;

    const view = map.getBounds();
    const padded = view.pad(0.2);
    request?.abort();
    const mine = new AbortController();
    request = mine;
    try {
      const data = await ShvApi.getObstacles(
        {
          minLon: padded.getWest(),
          minLat: padded.getSouth(),
          maxLon: padded.getEast(),
          maxLat: padded.getNorth(),
          zoom,
        },
        { signal: mine.signal },
      );
      if (request !== mine) return;
      onLoad(data.failed);
      const fresh = data.features.filter((f) => !drawn.has(obstacleKey(f)));
      if (fresh.length)
        layer.addData({
          type: "FeatureCollection",
          features: fresh,
        } as GeoJSON.FeatureCollection);
      if (drawn.size > OBSTACLE_PRUNE_AT) {
        const keep = view.pad(0.8);
        for (const [key, item] of drawn)
          if (item.at && !keep.contains(item.at)) {
            layer.removeLayer(item.layer);
            drawn.delete(key);
          }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      console.error("[maps.obstacles] Cannot load the obstacles:", err);
    }
  }

  return { layer, update, clear };
}

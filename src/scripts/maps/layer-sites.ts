// The flying-site layers: take-offs, landings and landing patterns, drawn
// from the snapshot as the search and wind filter leave them.

import L from "leaflet";
import type { Say } from "../i18n/text.ts";
import type { FlyingSiteFeature } from "../types.ts";
import {
  landingPatterns,
  patternArrowHtml,
  patternPopupHtml,
  siteMarkerHtml,
  siteNames,
  visibleSites,
} from "./sites.ts";
import { centredIcon, onPick } from "./view.ts";

export interface SiteLayers {
  launches: L.LayerGroup;
  landings: L.LayerGroup;
  patterns: L.LayerGroup;
  /** Each site's name by its id, for the sheet. */
  names: ReadonlyMap<string, string>;
  setData(features: FlyingSiteFeature[]): void;
  /** Redraws for the search, wind filter and language. */
  draw(
    search: string,
    windFilter: readonly string[],
    say: Say,
    lang: string,
  ): void;
}

export function siteLayers(pick: (f: FlyingSiteFeature) => void): SiteLayers {
  const launches = L.layerGroup();
  const landings = L.layerGroup();
  const patterns = L.layerGroup();
  let features: FlyingSiteFeature[] = [];
  let names = new Map<string, string>();
  let patternsLang: string | null = null;

  function marker(
    f: FlyingSiteFeature,
    at: L.LatLngExpression,
    isLaunch: boolean,
    say: Say,
  ) {
    const m = L.marker(at, {
      icon: L.divIcon({
        className: "shv-div-icon",
        html: siteMarkerHtml(f, isLaunch, say),
        iconSize: [46, 46],
        iconAnchor: [23, 23],
        popupAnchor: [0, -23],
      }),
    });
    onPick(m, () => pick(f));
    return m;
  }

  function drawPatterns(say: Say): void {
    patterns.clearLayers();
    for (const p of landingPatterns(
      features,
      names,
      say("map.popup.landingPattern"),
    )) {
      const casing = L.polyline(p.path, {
        color: "#0F172A",
        weight: 6,
        opacity: 0.65,
        lineCap: "round",
        lineJoin: "round",
      });
      const line = L.polyline(p.path, {
        color: p.color,
        weight: 3.5,
        opacity: 0.95,
        dashArray: "8, 6",
        lineCap: "round",
        lineJoin: "round",
      });
      const arrow = L.marker(p.path[p.path.length - 1], {
        icon: centredIcon("volte-arrow-icon", patternArrowHtml(p), [20, 20]),
        interactive: false,
      });
      const popup = patternPopupHtml(p, say);
      line.bindPopup(popup, { maxWidth: 280 });
      casing.bindPopup(popup, { maxWidth: 280 });
      patterns.addLayer(L.featureGroup([casing, line, arrow]));
    }
  }

  return {
    launches,
    landings,
    patterns,
    get names() {
      return names;
    },
    setData(fs) {
      features = fs;
      names = siteNames(fs);
      patternsLang = null;
    },
    draw(search, windFilter, say, lang) {
      launches.clearLayers();
      landings.clearLayers();
      const sites = visibleSites(features, search, windFilter);
      for (const s of sites.launches)
        launches.addLayer(marker(s.feature, s.at, true, say));
      for (const s of sites.landings)
        landings.addLayer(marker(s.feature, s.at, false, say));
      // patterns don't follow the filters, only the language
      if (lang !== patternsLang) {
        patternsLang = lang;
        drawPatterns(say);
      }
    },
  };
}

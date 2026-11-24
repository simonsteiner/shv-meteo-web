// What the layers drawer shows under each of its three tabs, in order:
// src/components/map/LayersDrawer.astro loops over it, and
// src/scripts/maps/page.ts keeps the controls in step with the store.

import type { BaseMap, Layers, MapCategory, MeteoMode } from "../settings.ts";

export type LayerKey = keyof Layers;

export type DrawerSection =
  | { kind: "meteo" }
  | {
      kind: "layers";
      title: "dangers" | "sites" | "wildlife";
      layers: LayerKey[];
    }
  | { kind: "compass" }
  | { kind: "baseMaps"; maps: BaseMap[] };

const SITES: DrawerSection = {
  kind: "layers",
  title: "sites",
  layers: ["launches", "landings", "landingPatterns"],
};
const WILDLIFE: DrawerSection = {
  kind: "layers",
  title: "wildlife",
  layers: ["wildschutz"],
};
const SWISSTOPO: DrawerSection = {
  kind: "baseMaps",
  maps: ["topoLight", "topoColor", "topoSatellite", "gliderChart"],
};

export const DRAWER_PANES: {
  category: MapCategory;
  sections: DrawerSection[];
}[] = [
  {
    category: "METEO",
    sections: [
      { kind: "meteo" },
      { kind: "layers", title: "dangers", layers: ["obstacles"] },
      SITES,
      { kind: "baseMaps", maps: ["topoLight", "topoColor", "topoOsm"] },
    ],
  },
  {
    category: "AIRSPACE",
    sections: [
      { kind: "layers", title: "dangers", layers: ["obstacles", "airspace"] },
      WILDLIFE,
      SITES,
      SWISSTOPO,
    ],
  },
  {
    category: "FLYING_AREAS",
    sections: [
      SITES,
      { kind: "compass" },
      { kind: "layers", title: "dangers", layers: ["obstacles"] },
      WILDLIFE,
      SWISSTOPO,
    ],
  },
];

/** The coloured dot before each layer's name. */
export const LAYER_DOTS: Partial<Record<LayerKey, string>> = {
  obstacles: "dot-obstacle",
  airspace: "dot-airspace",
  wildschutz: "dot-wild",
  launches: "dot-launch",
  landings: "dot-landing",
  landingPatterns: "dot-volte",
};

/** The weather overlays, each with its icon; NONE has its cross instead. */
export const METEO_PILLS: { mode: MeteoMode; icon: string }[] = [
  { mode: "WIND", icon: "🍃" },
  { mode: "TEMPERATURE", icon: "🌡️" },
  { mode: "PRESSURE_DIFFERENCE", icon: "⚡" },
  { mode: "WEBCAM", icon: "📷" },
  { mode: "NONE", icon: "✕" },
];

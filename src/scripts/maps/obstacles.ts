// How a BAZL obstacle looks on the map: cable and line ends as dots, masts,
// cranes and the like as dots up to z12 and as their icon from z13, lines
// and areas as paths. The shards come through ShvApi.getObstacles
// (src/scripts/obstacles/).

import { featureKey } from "../obstacles/lod.ts";
import type { ObstacleFeature } from "../types.ts";

type Props = ObstacleFeature["properties"];

/** Below this zoom the map draws no obstacles. */
export const OBSTACLE_MIN_ZOOM = 8;
/** Drawn obstacles beyond which those far outside the view are dropped. */
export const OBSTACLE_PRUNE_AT = 2500;
/** From this zoom, point obstacles show their icon. */
const ICON_ZOOM = 13;

/** The key an obstacle is drawn under: the same feature from two cells is
 * drawn once. */
export function obstacleKey(f: ObstacleFeature): string {
  return f.properties?._uid ?? featureKey(f);
}

export interface CircleStyle {
  kind: "circle";
  radius: number;
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
}

export interface IconStyle {
  kind: "icon";
  url: string;
  size: [number, number];
  anchor: [number, number];
}

const LINE_TYPES = ["TRANSMISSION_LINE", "CABLE_CAR", "CATENARY", "BRIDGE"];

function style(p: Props): string {
  return typeof p.styleId === "string" ? p.styleId : "";
}

/** The icon file for an obstacle: its `styleId` when that is a plain
 * name, else `fallback`. */
export function obstacleIconUrl(
  styleId: unknown,
  fallback = "ms_pole",
): string {
  const name =
    typeof styleId === "string" && /^[\w-]{1,64}$/.test(styleId)
      ? styleId
      : fallback;
  return `/assets/obstacles/${name}.svg`;
}

function circle(
  radius: number,
  color: string,
  fillColor: string,
  weight: number,
  fillOpacity = 0.9,
): CircleStyle {
  return { kind: "circle", radius, color, fillColor, fillOpacity, weight };
}

/** A point obstacle's look at `zoom`. */
export function obstaclePointStyle(
  p: Props,
  zoom: number,
): CircleStyle | IconStyle {
  if (LINE_TYPES.includes(p.obstacleType ?? "")) {
    if (p.marking === "MARKED" || p.obstacleType === "CATENARY")
      return circle(4.5, "#CC0000", "#FFD700", 2, 1);
    return p.obstacleType === "TRANSMISSION_LINE"
      ? circle(3.5, "#FFFFFF", "#CC0000", 1)
      : circle(3.5, "#FFFFFF", "#0054FF", 1);
  }
  const id = style(p);
  if (zoom < ICON_ZOOM) {
    if (id.includes("crane")) return circle(4.5, "#DC2626", "#EF4444", 1.5);
    if (id.includes("windmill")) return circle(4.5, "#0284C7", "#38BDF8", 1.5);
    if (id.includes("tree")) return circle(3.5, "#15803D", "#22C55E", 1.5);
    if (p.marking === "MARKED") return circle(5, "#FFFFFF", "#EF4444", 1.5);
    return circle(4, "#D97706", "#F59E0B", 1.5);
  }
  const icon = (
    size: [number, number],
    anchor: [number, number],
  ): IconStyle => ({
    kind: "icon",
    url: obstacleIconUrl(id),
    size,
    anchor,
  });
  if (id.includes("tree")) return icon([32, 28], [16, 26]);
  if (id.includes("crane")) return icon([28, 28], [14, 26]);
  if (id.includes("building")) return icon([24, 24], [12, 22]);
  if (id.includes("windmill")) return icon([24, 28], [12, 26]);
  return icon([22, 34], [11, 32]);
}

export interface PathStyle {
  color: string;
  weight: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
}

/** A line or area obstacle's look: lines red (transmission lines blue
 * unless marked), areas red (orange around an airport). */
export function obstaclePathStyle(f: ObstacleFeature): PathStyle | null {
  const p = f.properties ?? {};
  const type = f.geometry?.type;
  if (type === "LineString" || type === "MultiLineString") {
    const transmission = p.obstacleType === "TRANSMISSION_LINE";
    return {
      color: transmission && p.marking !== "MARKED" ? "#0054FF" : "#CC0000",
      weight: transmission ? 2.5 : 2,
      opacity: 0.9,
    };
  }
  if (type === "Polygon" || type === "MultiPolygon") {
    const color = p.airport ? "#FF841B" : "#CC0000";
    return { color, weight: 1.5, fillColor: color, fillOpacity: 0.06 };
  }
  return null;
}

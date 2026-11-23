// Which BAZL obstacles the map shows at a zoom (the level of detail the
// Express provider applied), the key that identifies a feature, and the
// 2000-feature cap per view. Pure; used by the shard script and the client.
import type { Bbox, ObstacleFeature } from "../types.ts";

/** Cable ends: their pylon dots show only from z13 (the official style). */
const CABLE_TYPES = ["TRANSMISSION_LINE", "CABLE_CAR", "CATENARY", "BRIDGE"];

/** Whether the map shows `f` at `zoom`: nothing below 7; polygons always;
 * up to z11 a line or point symbol needs a MARKED marking or a height that
 * drops as zoom rises; cable pylon dots only from z13. */
export function visibleAt(f: ObstacleFeature, zoom: number): boolean {
  if (zoom < 7) return false;
  const type = f.geometry?.type;
  const p = f.properties ?? {};
  const marked = p.marking === "MARKED";
  const h = p.maxHeightAgl ?? 0;
  if (type === "Polygon" || type === "MultiPolygon") return true;
  if (type === "Point") {
    if (CABLE_TYPES.includes(p.obstacleType ?? "")) return zoom >= 13;
    if (marked) return true;
    if (zoom < 9) return h >= 80;
    if (zoom < 10) return h >= 50;
    if (zoom < 11) return h >= 30;
    if (zoom < 12) return !(p.small && h < 15);
    return true;
  }
  if (type === "LineString" || type === "MultiLineString") {
    if (marked) return true;
    // the country overview keeps only major high-voltage lines
    if (zoom < 9) return p.obstacleType === "TRANSMISSION_LINE" && h >= 60;
    if (zoom < 10) return h >= 35;
    if (zoom < 11) return h >= 20;
    if (zoom < 12) return !(h < 10 && p.small);
    return true;
  }
  return false;
}

/** `<sourceId or id>_<geometry type>[_<partIndex>]`: one key per drawn
 * feature, stable across cells and loads (the map dedupes by it). */
export function featureKey(f: ObstacleFeature): string {
  const p = f.properties ?? {};
  const base = p.sourceId || f.id || p.id || "obs";
  const part =
    p.partIndex !== null && p.partIndex !== undefined ? `_${p.partIndex}` : "";
  return `${base}_${f.geometry?.type ?? "geom"}${part}`;
}

/** At most `max` features, the same ones whatever the order they came in:
 * marked first, then cable cars, then taller, then by key. */
export function capFeatures(
  fs: ObstacleFeature[],
  max = 2000,
): ObstacleFeature[] {
  if (fs.length <= max) return fs;
  const key = (f: ObstacleFeature) => f.properties._uid ?? featureKey(f);
  return [...fs]
    .sort((a, b) => {
      const marked =
        Number(b.properties.marking === "MARKED") -
        Number(a.properties.marking === "MARKED");
      if (marked) return marked;
      const cable =
        Number(b.properties.obstacleType === "CABLE_CAR") -
        Number(a.properties.obstacleType === "CABLE_CAR");
      if (cable) return cable;
      const h =
        (b.properties.maxHeightAgl ?? 0) - (a.properties.maxHeightAgl ?? 0);
      if (h) return h;
      return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
    })
    .slice(0, max);
}

/** The box around a GeoJSON geometry's coordinates. */
export function bboxOf(geometry: ObstacleFeature["geometry"]): Bbox {
  const box = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      box.minLon = Math.min(box.minLon, c[0]);
      box.maxLon = Math.max(box.maxLon, c[0]);
      box.minLat = Math.min(box.minLat, c[1]);
      box.maxLat = Math.max(box.maxLat, c[1]);
      return;
    }
    for (const inner of c) walk(inner);
  };
  walk(geometry?.coordinates);
  return box;
}

export function intersects(a: Bbox, b: Bbox): boolean {
  return !(
    a.maxLon < b.minLon ||
    a.minLon > b.maxLon ||
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat
  );
}

/** Only what the client reads, plus `small` (the LOD) and `_uid`. */
export function slim(f: ObstacleFeature): ObstacleFeature {
  const p = f.properties ?? {};
  return {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: {
      id: p.id ?? (f.id === undefined ? undefined : String(f.id)),
      sourceId: p.sourceId,
      partIndex: p.partIndex,
      obstacleType: p.obstacleType,
      marking: p.marking,
      lighting: p.lighting,
      maxHeightAgl: p.maxHeightAgl,
      topElevationAmsl: p.topElevationAmsl,
      styleId: p.styleId,
      airport: p.airport,
      geometryType: p.geometryType ?? f.geometry?.type,
      small: p.small,
      _uid: featureKey(f),
    },
  };
}

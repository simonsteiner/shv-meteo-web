// Where to put a feature on the map, or its coordinates in a sheet. Many
// flying-site and obstacle features are not points (Polygon, MultiPolygon,
// LineString), so nothing indexes `geometry.coordinates` directly.

/** [lat, lng], Leaflet's order. */
export type LatLngTuple = [number, number];

interface Geometry {
  type?: unknown;
  coordinates?: unknown;
}

function position(pt: unknown): [lng: number, lat: number] | null {
  if (!Array.isArray(pt) || pt.length < 2) return null;
  const [lng, lat] = pt;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/** The mean of the valid positions in `pts`, else null. */
function mean(pts: unknown): LatLngTuple | null {
  if (!Array.isArray(pts)) return null;
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const pt of pts) {
    const p = position(pt);
    if (!p) continue;
    lng += p[0];
    lat += p[1];
    n++;
  }
  return n ? [lat / n, lng / n] : null;
}

/** A ring's vertices without its closing one: GeoJSON repeats the first
 * vertex at the end, which would weigh it twice in the mean. */
function ring(pts: unknown): unknown {
  if (!Array.isArray(pts) || pts.length < 2) return pts;
  const a = position(pts[0]);
  const b = position(pts[pts.length - 1]);
  return a && b && a[0] === b[0] && a[1] === b[1] ? pts.slice(0, -1) : pts;
}

function first(list: unknown): unknown {
  return Array.isArray(list) ? list[0] : undefined;
}

/** A point standing for the feature: a Point itself, the mean of a line's
 * vertices, of a MultiPoint's points or of a polygon's outer ring (its
 * closing vertex counted once), the first part of a MultiLineString or
 * MultiPolygon; null for anything else or invalid coordinates. */
export function featureLatLng(
  feature: { geometry?: Geometry | null } | null | undefined,
): LatLngTuple | null {
  const geom = feature?.geometry;
  if (!geom) return null;
  const c = geom.coordinates;
  switch (geom.type) {
    case "Point": {
      const p = position(c);
      return p ? [p[1], p[0]] : null;
    }
    case "LineString":
    case "MultiPoint":
      return mean(c);
    case "Polygon":
      return mean(ring(first(c)));
    case "MultiLineString":
      return mean(first(c));
    case "MultiPolygon":
      return mean(ring(first(first(c))));
    default:
      return null;
  }
}

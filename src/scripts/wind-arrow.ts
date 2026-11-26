// The wind arrow's direction, the same on the map's station markers
// (maps/stations.ts) and the weather page's station cards
// (weather/cards.ts): it points downwind, where the wind blows to, as the
// official app's wind_arrow.svg does. Pure.

/** The CSS rotation in whole degrees that turns an arrow drawn pointing
 * north (up) to point downwind of a wind from `dirDeg` (meteorological,
 * where it comes from); null without a direction, so no arrow is drawn
 * rather than a made-up north one. */
export function downwindRotation(
  dirDeg: number | null | undefined,
): number | null {
  if (dirDeg == null || !Number.isFinite(dirDeg)) return null;
  return (Math.round(dirDeg) + 180) % 360;
}

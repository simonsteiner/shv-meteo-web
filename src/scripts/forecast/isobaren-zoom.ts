// The isobar chart's tap to zoom: the site turns off pinch zoom for the
// map, so a tap on the chart switches it between the card's width and a
// wider size that scrolls sideways, keeping the tapped spot under the
// finger.

/** The zoomed chart's width: upstream's own width, where its labels are
 * the size it drew them, or twice the fitted width on a screen wide
 * enough to show that already. */
export function zoomedWidth(fitWidth: number, naturalWidth: number): number {
  return Math.max(naturalWidth, 2 * fitWidth);
}

/** How to scroll after the chart's width changes by `scale`, so the point
 * at `point` (pixels from the chart's top-left corner before the change)
 * stays where it was: `left` is the chart box's new horizontal scroll and
 * `down` how far to scroll the page. `viewX` is the point's distance from
 * the left edge of the chart box's content, inside its padding. */
export function keepPoint(
  point: { x: number; y: number },
  scale: number,
  viewX: number,
): { left: number; down: number } {
  return {
    left: Math.max(0, point.x * scale - viewX),
    down: point.y * (scale - 1),
  };
}

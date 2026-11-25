// What every ported page's script does with its static markup and images.

/** The element `selector` finds in `root`; a missing one is a bug in the
 * page's markup, so it throws with the selector. */
export function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`[dom] Missing ${selector}`);
  return el;
}

/** Swaps a failed image to its `data-fallback` source. False when it has
 * none, or (`once`, the default) it was used already, or it is the source
 * that failed, so the caller shows its own empty state. `once: false`
 * keeps the fallback for an image whose source changes again (the sheet's
 * webcam, which toggles to its time-lapse and back). */
export function useFallback(
  img: { src: string; dataset: Record<string, string | undefined> },
  { once = true }: { once?: boolean } = {},
): boolean {
  const fallback = img.dataset.fallback;
  if (!fallback || img.src === fallback) return false;
  if (once) delete img.dataset.fallback;
  img.src = fallback;
  return true;
}

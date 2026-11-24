// What every ported page's script does with its static markup and images.

/** The element `selector` finds in `root`; a missing one is a bug in the
 * page's markup, so it throws with the selector. */
export function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`[dom] Missing ${selector}`);
  return el;
}

/** Swaps a failed image to its `data-fallback` source, once. False when it
 * has none (left), so the caller shows its own empty state. */
export function useFallback(img: {
  src: string;
  dataset: Record<string, string | undefined>;
}): boolean {
  const fallback = img.dataset.fallback;
  if (!fallback) return false;
  delete img.dataset.fallback;
  img.src = fallback;
  return true;
}

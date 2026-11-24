// What every ported page's script does with its static markup.

/** The element `selector` finds in `root`; a missing one is a bug in the
 * page's markup, so it throws with the selector. */
export function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`[dom] Missing ${selector}`);
  return el;
}

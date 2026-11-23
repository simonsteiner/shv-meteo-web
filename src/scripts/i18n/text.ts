// The language-neutral frame of a ported page is static `.astro` markup;
// its words come from the `src/i18n/` dictionaries at runtime, so the
// header's language switch keeps working without a reload. An element names
// its string by a dotted key: `data-t` for its text, `data-t-<attribute>`
// for an attribute (placeholder, title, aria-label).

/** A dictionary as `src/i18n/*.js` export it: nested objects of strings. */
export interface Dictionary {
  [key: string]: string | Dictionary;
}

/** The string at a dotted key (`safety.p1`), else null. */
export function lookup(dict: Dictionary, key: string): string | null {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (
      typeof node !== "object" ||
      !Object.prototype.hasOwnProperty.call(node, part)
    )
      return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/** The attributes `applyText` fills besides the text. */
export const TEXT_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

/** What `applyText` needs of an element; a real Element has it. */
export interface TextTarget {
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/** The strings of `root`'s marked elements from `dict`. A missing key logs
 * and leaves the element as it is, so a gap shows rather than breaking the
 * page. */
export function applyText(
  root: { querySelectorAll(selector: string): Iterable<TextTarget> },
  dict: Dictionary,
): void {
  const text = (el: TextTarget, attr: string): string | null => {
    const key = el.getAttribute(attr);
    if (key === null) return null;
    const value = lookup(dict, key);
    if (value === null) console.error(`[i18n] Missing string ${key}`);
    return value;
  };
  for (const el of root.querySelectorAll("[data-t]")) {
    const value = text(el, "data-t");
    if (value !== null) el.textContent = value;
  }
  for (const name of TEXT_ATTRIBUTES)
    for (const el of root.querySelectorAll(`[data-t-${name}]`)) {
      const value = text(el, `data-t-${name}`);
      if (value !== null) el.setAttribute(name, value);
    }
}

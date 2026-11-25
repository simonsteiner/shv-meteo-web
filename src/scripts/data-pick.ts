// What a click or change on page markup picked: the first of a set of
// `data-*` attributes the element carries, its value checked against the
// store union it names. A page script asks this module, then calls the
// store setter for the key it answers, so no markup string reaches a setter
// unchecked.
import { isOneOf } from "./coerce.ts";

/** Each `dataset` key a page reads, with the values it accepts. */
export type PickLists = Readonly<Record<string, readonly string[]>>;

/** One picked key and its checked value. */
export type DataPick<L extends PickLists> = {
  [K in keyof L & string]: { key: K; value: L[K][number] };
}[keyof L & string];

/** The `data-*` attribute a `dataset` key stands for (`mapCategory` is
 * `data-map-category`). */
function attributeOf(key: string): string {
  return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** The first key of `lists` that `data` carries, in the order `lists`
 * names them, with its value; null when it carries none. A value its list
 * lacks (a typo in the markup) answers null too, logged under `[module]`,
 * so the page ignores it. */
export function readPick<L extends PickLists>(
  data: Readonly<Record<string, string | undefined>>,
  lists: L,
  module: string,
): DataPick<L> | null {
  for (const key of Object.keys(lists)) {
    const value = data[key];
    if (value === undefined) continue;
    // `key` comes from `lists` and `value` passed its list, which is what
    // DataPick states; TypeScript can't follow a key through Object.keys
    if (isOneOf(lists[key], value)) return { key, value } as DataPick<L>;
    console.error(`[${module}] Unknown ${attributeOf(key)} "${value}"`);
    return null;
  }
  return null;
}

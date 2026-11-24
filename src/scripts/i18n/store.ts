// The store's dictionary for the page scripts. Kept apart from text.ts,
// which stays pure for its tests: src/scripts/state.ts reads `document` on
// import.

import { store } from "../state.ts";
import { say, type Dictionary } from "./text.ts";

/** The dictionary of the current UI language. */
export function storeDictionary(): Dictionary {
  return store.t;
}

/** The current language's string at `key`, or "" after logging. */
export function storeSay(key: string): string {
  return say(storeDictionary(), key);
}

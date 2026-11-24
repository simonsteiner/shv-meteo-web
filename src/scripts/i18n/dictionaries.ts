// The four UI languages' dictionaries, German the default. Each language
// is typed as German's shape (`Strings`), so a key missing from one fails
// the typecheck; dictionaries.test.ts also catches a key only one has.

import type { Lang } from "../settings.ts";
import { de, type Strings } from "./de.ts";
import { en } from "./en.ts";
import { fr } from "./fr.ts";
import { it } from "./it.ts";

export type { Strings };

export const DICTIONARIES: Readonly<Record<Lang, Strings>> = { de, fr, it, en };

/** The dictionary of `lang`. */
export function dictionaryFor(lang: Lang): Strings {
  return DICTIONARIES[lang];
}

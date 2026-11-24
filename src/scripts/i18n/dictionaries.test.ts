import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGS } from "../settings.ts";
import { DICTIONARIES } from "./dictionaries.ts";
import type { Dictionary } from "./text.ts";

/** Every dotted key of `dict` that holds a string, sorted. */
function keys(dict: Dictionary, prefix = ""): string[] {
  return Object.entries(dict)
    .flatMap(([key, value]) =>
      typeof value === "string"
        ? [prefix + key]
        : keys(value, `${prefix}${key}.`),
    )
    .sort();
}

test("every language has German's keys and no others", () => {
  const german = keys(DICTIONARIES.de);
  assert.ok(german.length > 100);
  for (const lang of LANGS)
    assert.deepEqual(keys(DICTIONARIES[lang]), german, `${lang} keys`);
});

test("every entry is a string or a nested dictionary", () => {
  for (const lang of LANGS) {
    const walk = (node: unknown, path: string): void => {
      if (typeof node === "string") return;
      assert.ok(
        typeof node === "object" && node !== null && !Array.isArray(node),
        `${lang}: ${path} is neither a string nor a dictionary`,
      );
      for (const [key, value] of Object.entries(node))
        walk(value, path ? `${path}.${key}` : key);
    };
    walk(DICTIONARIES[lang], "");
  }
});

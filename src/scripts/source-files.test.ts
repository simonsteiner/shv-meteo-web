// Everything under src/ is TypeScript or .astro, so `astro check` covers it
// (AGENTS.md, Gotchas). A .js file there would skip the type checker.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

test("no JavaScript files under src/", () => {
  const js = files(SRC).filter((f) => /\.(c|m)?jsx?$/.test(f));
  assert.deepEqual(js, []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { dictionaryFor } from "../i18n/dictionaries.ts";
import { say as sayIn } from "../i18n/text.ts";
import { LANGS, defaultSettings } from "../settings.ts";
import { DATASETS, failedShown, loadStatusText } from "./load-status.ts";

const layers = defaultSettings().layers;

test("a failed data set counts only while a layer it fills is shown", () => {
  const failed = new Set(["webcams", "measurements"] as const);
  assert.deepEqual(failedShown(failed, layers), ["measurements"]);
  assert.deepEqual(
    failedShown(failed, { ...layers, stations: false, webcams: true }),
    ["webcams"],
  );
  assert.deepEqual(failedShown(new Set(), layers), []);
});

test("the flying sites count for any of their three layers", () => {
  const failed = new Set(["sites"] as const);
  assert.deepEqual(failedShown(failed, layers), []);
  assert.deepEqual(failedShown(failed, { ...layers, landingPatterns: true }), [
    "sites",
  ]);
});

test("the status line names the failed data sets in every language", () => {
  for (const lang of LANGS) {
    const say = (key: string) => {
      const text = sayIn(dictionaryFor(lang), key);
      assert.notEqual(text, "", `${lang}: ${key}`);
      return text;
    };
    const line = loadStatusText([...DATASETS], say);
    assert.doesNotMatch(line, /\{names\}/);
  }
  assert.equal(
    loadStatusText([], () => "x"),
    "",
  );
  assert.equal(
    loadStatusText(["foehn", "webcams"], (k) =>
      k === "map.loadFailed" ? "Not loaded: {names}" : k.slice(12),
    ),
    "Not loaded: foehn, webcams",
  );
});

test("failed obstacles count while the obstacle layer is shown", () => {
  const failed = new Set(["obstacles"] as const);
  assert.deepEqual(failedShown(failed, layers), []);
  assert.deepEqual(failedShown(failed, { ...layers, obstacles: true }), [
    "obstacles",
  ]);
});

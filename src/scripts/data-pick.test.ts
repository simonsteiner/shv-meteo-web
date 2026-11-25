import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { readPick } from "./data-pick.ts";
import { BASE_MAPS, COMPASS, LAYER_KEYS, MAP_CATEGORIES } from "./settings.ts";

const MAP = { mapCategory: MAP_CATEGORIES, base: BASE_MAPS, wind: COMPASS };

/** `run` with console.error recorded: what it answered and what it logged. */
function logged<T>(run: () => T): { answer: T; errors: string[] } {
  const spy = mock.method(console, "error", () => {});
  try {
    const answer = run();
    return {
      answer,
      errors: spy.mock.calls.map((c) => String(c.arguments[0])),
    };
  } finally {
    spy.mock.restore();
  }
}

test("a known value answers its key and value, logging nothing", () => {
  const { answer, errors } = logged(() =>
    readPick({ mapCategory: "AIRSPACE" }, MAP, "maps"),
  );
  assert.deepEqual(answer, { key: "mapCategory", value: "AIRSPACE" });
  assert.deepEqual(errors, []);
});

test("an unknown value is ignored and logged with its attribute", () => {
  const { answer, errors } = logged(() =>
    readPick({ mapCategory: "AIRSPACES" }, MAP, "maps"),
  );
  assert.equal(answer, null);
  assert.deepEqual(errors, ['[maps] Unknown data-map-category "AIRSPACES"']);
});

test("an empty value is unknown, not absent", () => {
  const { answer, errors } = logged(() =>
    readPick({ layer: "" }, { layer: LAYER_KEYS }, "maps"),
  );
  assert.equal(answer, null);
  assert.deepEqual(errors, ['[maps] Unknown data-layer ""']);
});

test("no listed attribute answers null without logging", () => {
  const { answer, errors } = logged(() =>
    readPick({ action: "centre" }, MAP, "maps"),
  );
  assert.equal(answer, null);
  assert.deepEqual(errors, []);
});

test("the first listed key the element carries wins", () => {
  const { answer } = logged(() =>
    readPick({ wind: "N", base: "topoOsm", mapCategory: "METEO" }, MAP, "maps"),
  );
  assert.deepEqual(answer, { key: "mapCategory", value: "METEO" });
  // a typo in the first key it carries is not passed over for a later one
  const typo = logged(() => readPick({ base: "nope", wind: "N" }, MAP, "maps"));
  assert.equal(typo.answer, null);
  assert.deepEqual(typo.errors, ['[maps] Unknown data-base "nope"']);
});

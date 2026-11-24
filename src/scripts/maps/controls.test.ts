import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings } from "../settings.ts";
import { controlsView, pressed } from "./controls.ts";

const say = (key: string) =>
  key === "map.windPill" ? "Wind: {dirs}" : "Reset ({dirs})";
const state = { ...defaultSettings(), searchQuery: "" };

test("no search and no wind filter hide the pills, the clear and reset", () => {
  const view = controlsView(state, say);
  assert.equal(view.pillsShown, false);
  assert.equal(view.searchShown, false);
  assert.equal(view.windShown, false);
  assert.equal(view.windCount, 0);
  assert.equal(view.dabsShown, false);
});

test("a search shows its pill and the clear button", () => {
  const view = controlsView({ ...state, searchQuery: "Rigi" }, say);
  assert.equal(view.pillsShown, true);
  assert.equal(view.searchShown, true);
  assert.equal(view.searchPillText, '"Rigi"');
  assert.equal(view.windShown, false);
});

test("a wind filter names its directions on the pill and the reset", () => {
  const view = controlsView({ ...state, windFilter: ["N", "NW"] }, say);
  assert.equal(view.pillsShown, true);
  assert.equal(view.windShown, true);
  assert.equal(view.windCount, 2);
  assert.equal(view.windPillText, "Wind: N, NW");
  assert.equal(view.windResetLabel, "Reset (N, NW)");
});

test("the DABS link shows under the airspace tab only", () => {
  assert.equal(
    controlsView({ ...state, mapCategory: "AIRSPACE" }, say).dabsShown,
    true,
  );
});

test("a drawer button is pressed when the state holds its value", () => {
  const s = {
    ...state,
    windFilter: ["SE" as const],
    baseMap: "topoOsm" as const,
  };
  assert.equal(pressed(s, "wind", "SE"), true);
  assert.equal(pressed(s, "wind", "N"), false);
  assert.equal(pressed(s, "meteoMode", "WIND"), true);
  assert.equal(pressed(s, "base", "topoOsm"), true);
  assert.equal(pressed(s, "mapCategory", "AIRSPACE"), false);
  assert.equal(pressed(s, "base", undefined), false);
});

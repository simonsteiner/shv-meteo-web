import assert from "node:assert/strict";
import { test } from "node:test";
import type { Selection } from "../sheet/render.ts";
import { defaultSettings } from "../settings.ts";
import type { FlyingSiteFeature } from "../types.ts";
import { NOTHING_DRAWN, redraws, type Drawn } from "./redraws.ts";

const state = { ...defaultSettings(), searchQuery: "" };
const site = { type: "Feature" } as FlyingSiteFeature;
const selected: Selection = { kind: "site", value: site };

/** What was drawn after a first render of `s`. */
function after(s = state, sel: Selection | null = null): Drawn {
  return redraws(NOTHING_DRAWN, s, sel).drawn;
}

test("the first render draws the words, sites, stations and sheet", () => {
  const { redraw } = redraws(NOTHING_DRAWN, state, null);
  assert.deepEqual(redraw, {
    text: true,
    sites: true,
    stations: true,
    obstacles: null,
    sheet: true,
  });
});

test("an unchanged state redraws nothing", () => {
  const drawn = after(state, selected);
  assert.deepEqual(redraws(drawn, state, selected).redraw, {
    text: false,
    sites: false,
    stations: false,
    obstacles: null,
    sheet: false,
  });
});

test("a language switch redraws the words, sites and sheet", () => {
  const { redraw } = redraws(after(), { ...state, lang: "fr" }, null);
  assert.equal(redraw.text, true);
  assert.equal(redraw.sites, true);
  assert.equal(redraw.sheet, true);
  assert.equal(redraw.stations, false);
});

test("a search or wind filter redraws the sites only", () => {
  const { redraw } = redraws(after(), { ...state, windFilter: ["N"] }, null);
  assert.equal(redraw.sites, true);
  assert.equal(redraw.text, false);
  assert.equal(redraw.sheet, false);
});

test("new site data redraws the sites", () => {
  const drawn = { ...after(), sites: "" };
  assert.equal(redraws(drawn, state, null).redraw.sites, true);
});

test("stations redraw on a mode switch and when shown again", () => {
  const drawn = after();
  assert.equal(
    redraws(drawn, { ...state, meteoMode: "TEMPERATURE" }, null).redraw
      .stations,
    true,
  );
  const hidden = { ...state, layers: { ...state.layers, stations: false } };
  const off = redraws(drawn, hidden, null);
  assert.equal(off.redraw.stations, false);
  assert.equal(off.drawn.stationsMode, null);
  assert.equal(redraws(off.drawn, state, null).redraw.stations, true);
});

test("obstacles load when shown and clear when hidden", () => {
  const shown = { ...state, layers: { ...state.layers, obstacles: true } };
  const on = redraws(after(), shown, null);
  assert.equal(on.redraw.obstacles, "load");
  assert.equal(redraws(on.drawn, shown, null).redraw.obstacles, null);
  assert.equal(redraws(on.drawn, state, null).redraw.obstacles, "clear");
});

test("a new selection or a cleared one redraws the sheet", () => {
  assert.equal(redraws(after(), state, selected).redraw.sheet, true);
  assert.equal(redraws(after(state, selected), state, null).redraw.sheet, true);
});

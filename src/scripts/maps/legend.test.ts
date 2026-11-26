import assert from "node:assert/strict";
import util from "node:util";
import { test } from "node:test";
import { de } from "../i18n/de.ts";
import { lookup } from "../i18n/text.ts";
import { airspaceStyle, WILDLIFE_STYLE } from "./airspace.ts";
import { AIRSPACE_LEGEND, swatchSvg } from "./legend.ts";

test("each legend entry draws the style the map gives its type", () => {
  const ctr = AIRSPACE_LEGEND.find((e) => e.key === "ctr");
  assert.deepEqual(ctr?.style, airspaceStyle("CTR", false));
  const byAgreement = AIRSPACE_LEGEND.find(
    (e) => e.key === "airfieldAgreement",
  );
  assert.deepEqual(byAgreement?.style, airspaceStyle("Airfield", true));
  assert.deepEqual(
    AIRSPACE_LEGEND.find((e) => e.key === "wildlife")?.style,
    WILDLIFE_STYLE,
  );
});

// Every type and agreement flag the SHV CDN's airspaces carried on
// 2026-11-26 (airspaces/shv.geojson, 359 zones).
const UPSTREAM_AIRSPACES: [string, boolean][] = [
  ["AWY", false],
  ["Airfield", false],
  ["Airfield", true],
  ["CTA", false],
  ["CTR", false],
  ["FIZ", false],
  ["FIZ", true],
  ["Heliport", false],
  ["Heliport", true],
  ["Q", false],
  ["R", false],
  ["RMZ", false],
  ["TMA", false],
  ["W", false],
];

test("every airspace upstream sends is drawn in a style the legend shows", () => {
  for (const [type, byAgreement] of UPSTREAM_AIRSPACES)
    assert.ok(
      AIRSPACE_LEGEND.some((e) =>
        util.isDeepStrictEqual(e.style, airspaceStyle(type, byAgreement)),
      ),
      `${type}|${byAgreement}`,
    );
});

test("every legend entry has its words in the dictionary", () => {
  // dictionaries.test.ts holds the other three languages to the same keys
  for (const e of AIRSPACE_LEGEND)
    assert.ok(lookup(de, `map.legend.${e.key}`), e.key);
});

test("a swatch carries the stroke, dash and fill of its style", () => {
  const svg = swatchSvg(airspaceStyle("CTR", false));
  assert.match(svg, /stroke="#006092"/);
  assert.match(svg, /stroke-width="2"/);
  assert.match(svg, /stroke-dasharray="6 3"/);
  assert.match(svg, /fill="#006092"/);
  assert.match(svg, /fill-opacity="0.12"/);
  assert.match(svg, /aria-hidden="true"/);
  // no dash, no dasharray; no fill colour falls back to the stroke's
  const plain = swatchSvg({ color: "#123456", weight: 1, fillOpacity: 0.1 });
  assert.doesNotMatch(plain, /stroke-dasharray/);
  assert.match(plain, /fill="#123456"/);
});

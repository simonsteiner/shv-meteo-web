import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("every airspace in the snapshot is drawn in a style the legend shows", () => {
  const path = join(
    import.meta.dirname,
    "../../../public/data/airspaces.geojson",
  );
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    features: {
      properties: { type?: unknown; inactiveByAgreement?: unknown };
    }[];
  };
  const seen = new Set<string>();
  for (const { properties: p } of data.features) {
    const style = airspaceStyle(p.type, p.inactiveByAgreement);
    const key = `${String(p.type)}|${Boolean(p.inactiveByAgreement)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assert.ok(
      AIRSPACE_LEGEND.some((e) => util.isDeepStrictEqual(e.style, style)),
      key,
    );
  }
  assert.ok(seen.size > 0);
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

import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlyingSiteFeature } from "../types.ts";
import {
  arrowHeading,
  findSite,
  landingCircuits,
  launchAngle,
  matchesSearch,
  circuitColor,
  circuitPopupHtml,
  siteMarkerHtml,
  siteNames,
  suitsWind,
  visibleSites,
} from "./sites.ts";

const say = (key: string) => `[${key}]`;

function site(
  props: FlyingSiteFeature["properties"],
  coordinates: unknown = [8.5, 47],
  type = "Point",
): FlyingSiteFeature {
  return {
    type: "Feature",
    geometry: { type, coordinates },
    properties: props,
  };
}

const launch = site({
  siteId: "a",
  siteName: "Alp Schwand",
  type: "launch",
  launchDirections: ["NW", "N"],
  responsible: "Club Rigi",
});
const landing = site({ siteId: "b", siteName: "Goldau", type: "landing" });
const area = site(
  { siteId: "a", siteName: "Alp Schwand", type: "launcharea" },
  [
    [
      [8, 46],
      [9, 46],
      [9, 47],
    ],
  ],
  "Polygon",
);

test("launchAngle maps the sixteen compass points and nothing else", () => {
  assert.equal(launchAngle("N"), 0);
  assert.equal(launchAngle("SW"), 225);
  assert.equal(launchAngle("NNW"), 337.5);
  assert.equal(launchAngle("toString"), null);
  assert.equal(launchAngle(""), null);
  assert.equal(launchAngle(undefined), null);
});

test("the search matches name, rules or club, ignoring case", () => {
  assert.equal(matchesSearch(launch.properties, ""), true);
  assert.equal(matchesSearch(launch.properties, "schwand"), true);
  assert.equal(matchesSearch(launch.properties, "rigi"), true);
  assert.equal(matchesSearch(launch.properties, "niesen"), false);
});

test("the wind filter keeps take-offs facing one of its directions", () => {
  assert.equal(suitsWind(launch.properties, []), true);
  assert.equal(suitsWind(launch.properties, ["S", "N"]), true);
  assert.equal(suitsWind(launch.properties, ["S"]), false);
  assert.equal(suitsWind({ launchDirections: null }, ["S"]), false);
});

test("visibleSites filters take-offs by search and wind, landings by search", () => {
  const all = [launch, landing, area];
  const none = visibleSites(all, "", []);
  assert.deepEqual(
    none.launches.map((s) => s.at),
    [[47, 8.5]],
  );
  assert.equal(none.landings.length, 1);
  const south = visibleSites(all, "", ["S"]);
  assert.equal(south.launches.length, 0);
  assert.equal(south.landings.length, 1);
  const goldau = visibleSites(all, "  GOLDAU ", []);
  assert.equal(goldau.launches.length, 0);
  assert.equal(goldau.landings.length, 1);
});

test("findSite finds a take-off or landing by its site id", () => {
  assert.equal(findSite([area, launch, landing], "a"), launch);
  assert.equal(findSite([area, launch, landing], "b"), landing);
  assert.equal(findSite([area], "a"), null);
});

test("siteNames indexes names by site id", () => {
  assert.equal(siteNames([launch, landing]).get("b"), "Goldau");
});

test("circuitColor cycles three colours", () => {
  assert.equal(circuitColor(0), "#016191");
  assert.equal(circuitColor(4), "#9333EA");
  assert.equal(circuitColor(null), "#016191");
});

test("arrowHeading follows the last leg", () => {
  assert.equal(
    arrowHeading([
      [46, 8],
      [47, 8],
    ]),
    0,
  );
  assert.equal(
    arrowHeading([
      [47, 8],
      [46, 8],
    ]),
    180,
  );
  const east = arrowHeading([
    [0, 8],
    [0, 9],
  ]);
  assert.equal(east, 90);
  assert.equal(arrowHeading([[47, 8]]), null);
  assert.equal(
    arrowHeading([
      [47, 8],
      [47, 8],
    ]),
    null,
  );
});

test("landingCircuits names a circuit after its description and site", () => {
  const circuit = site(
    {
      siteId: "b",
      type: "landingpattern",
      featureIndex: 1,
      description: null,
    },
    [
      [8, 46],
      [8, 47],
      ["x", 1],
    ],
    "LineString",
  );
  const [p] = landingCircuits([circuit, launch], siteNames([landing]), "Volte");
  assert.equal(p.name, "Volte");
  assert.equal(p.siteName, "Goldau");
  assert.equal(p.color, "#9333EA");
  assert.equal(p.path.length, 2);
  assert.equal(p.heading, 0);
});

test("upstream names land in markers and popups as text", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const html = siteMarkerHtml(
    site({ siteName: evil, type: "launch", launchDirections: ["S"] }),
    true,
    say,
  );
  assert.ok(!html.includes("<img"), html);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt; (S)"));
  assert.ok(html.includes("rotate(180deg)"));
  const popup = circuitPopupHtml(
    {
      feature: launch,
      path: [],
      color: "#000",
      name: evil,
      siteName: evil,
      heading: null,
    },
    say,
  );
  assert.ok(!popup.includes("<img"), popup);
});

test("a marker falls back to its kind's label and shows closed sites", () => {
  const html = siteMarkerHtml(
    site({ type: "landing", openingStatus: "closed" }),
    false,
    say,
  );
  assert.ok(html.includes('title="[map.sheet.landing]"'));
  assert.ok(html.includes("site-closed"));
  assert.ok(!html.includes("site-dir-badge"));
});

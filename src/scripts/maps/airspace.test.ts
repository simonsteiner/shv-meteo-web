import assert from "node:assert/strict";
import { test } from "node:test";
import {
  airspacePopupHtml,
  airspaceStyle,
  formatAltitude,
  wildlifePopupHtml,
} from "./airspace.ts";

const say = (key: string) => `[${key}]`;

test("each airspace type gets the official colour", () => {
  assert.equal(airspaceStyle("CTR", false).dashArray, "6, 3");
  assert.equal(airspaceStyle("TMA", false).color, "#006092");
  assert.equal(airspaceStyle("CTA", false).fillOpacity, 0.05);
  assert.equal(airspaceStyle("Airfield", false).color, "#6B4099");
  assert.equal(airspaceStyle("W", false).color, "#00A551");
  assert.equal(airspaceStyle("Q", false).color, "#E58E3D");
  assert.equal(airspaceStyle("R", false).color, "#E3000B");
  assert.equal(airspaceStyle("XYZ", false).color, "#3B82F6");
});

test("an aerodrome open by agreement is grey and dashed", () => {
  const style = airspaceStyle("Heliport", true);
  assert.equal(style.color, "#4B5563");
  assert.equal(style.dashArray, "4, 4");
  assert.equal(airspaceStyle("Airfield", false).dashArray, undefined);
});

test("formatAltitude keeps upstream's unit once", () => {
  assert.equal(formatAltitude(2320, "m QNH"), "2320 m QNH");
  assert.equal(formatAltitude(0, "m AGL"), "0 m AGL");
  assert.equal(formatAltitude(1500, "AMSL"), "1500 m AMSL");
  assert.equal(formatAltitude(1500, null), "1500 m");
  assert.equal(formatAltitude(null, "m QNH"), null);
});

test("the airspace popup shows the limits, radio and agreement", () => {
  const html = airspacePopupHtml(
    {
      type: "Airfield",
      name: "AIRFIELD SAMEDAN",
      lowerMetricAltitude: 0,
      lowerMetricReference: "m AGL",
      upperMetricAltitude: 2320,
      upperMetricReference: "m QNH",
      frequency: "135.325",
      callsign: "Samedan Information",
      inactiveByAgreement: true,
    },
    say,
  );
  assert.ok(html.includes("0 m AGL"));
  assert.ok(html.includes("2320 m QNH"));
  assert.ok(html.includes("135.325 MHz"));
  assert.ok(html.includes("[map.popup.byAgreement]"));
});

test("missing limits show a dash, an imperial upper limit its feet", () => {
  const html = airspacePopupHtml({ upperImperialAltitude: 9500 }, say);
  assert.ok(html.includes("[map.popup.lower]</strong> \u2013"));
  assert.ok(html.includes("9500 ft"));
  assert.ok(html.includes("[map.popup.airspaceZone]"));
});

test("upstream text lands in the popups as text", () => {
  const evil = "<img src=x onerror=alert(1)>";
  for (const html of [
    airspacePopupHtml(
      {
        name: evil,
        type: evil,
        additionalInfo: evil,
        callsign: evil,
        frequency: evil,
      },
      say,
    ),
    wildlifePopupHtml(
      {
        name: evil,
        additionalInfo: evil,
        upperAltitude: 1,
        upperReference: evil,
      },
      say,
    ),
  ])
    assert.ok(!html.includes("<img"), html);
});

test("a wildlife zone without a minimum altitude shows none", () => {
  const html = wildlifePopupHtml({ name: "Adlerhorst" }, say);
  assert.ok(!html.includes("[map.popup.minAltitude]"));
  assert.ok(
    wildlifePopupHtml(
      { upperAltitude: 2000, upperReference: "m QNH" },
      say,
    ).includes("2000 m QNH"),
  );
});

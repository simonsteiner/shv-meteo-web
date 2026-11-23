import assert from "node:assert/strict";
import { test } from "node:test";
import { flightCardHtml, flightCardsHtml } from "./cards.ts";
import type { Flight } from "./flights.ts";

const flight: Flight = {
  id: "f-1",
  date: "2026-07-14",
  site: "Fiescheralp",
  landing: "Fiesch",
  glider: "Mentor 7",
  duration: 95,
  distance: 25.4,
  maxAlt: null,
  notes: "",
  type: null,
};

test("flightCardHtml escapes every stored value", () => {
  const html = flightCardHtml({
    ...flight,
    site: "<img src=x onerror=alert(1)>",
    notes: '"><script>alert(1)</script>',
    type: "<b>",
  });
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<b>"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("flightCardHtml shows the optional details only when present", () => {
  const plain = flightCardHtml(flight);
  assert.ok(plain.includes("📍 25.4 km"));
  assert.ok(!plain.includes("⛰️"));
  assert.ok(!plain.includes("fl-type-pill"));
  assert.ok(!plain.includes("fl-notes"));
  const old = flightCardHtml({
    ...flight,
    distance: null,
    maxAlt: 3100,
    type: "Thermikflug",
    notes: "Basis 3200",
  });
  assert.ok(!old.includes("📍"));
  assert.ok(old.includes("⛰️ 3100 m"));
  assert.ok(old.includes('<span class="fl-type-pill">Thermikflug</span>'));
  assert.ok(old.includes("Basis 3200"));
});

test("flightCardsHtml joins the cards in order", () => {
  const html = flightCardsHtml([flight, { ...flight, site: "Niesen" }]);
  assert.ok(html.indexOf("Fiescheralp") < html.indexOf("Niesen"));
  assert.equal(flightCardsHtml([]), "");
});

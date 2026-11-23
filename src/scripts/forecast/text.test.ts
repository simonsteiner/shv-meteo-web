import assert from "node:assert/strict";
import { test } from "node:test";
import { localeFor, textProduct } from "./text.ts";

const answer = {
  forecast: { issueTime: 1, text: { "0": "<p>Nord</p>", "1": "<p>Süd</p>" } },
  generalForecast: { issueTime: 2, text: "<p>Lage</p>" },
  flugwetterForecast: { issueTime: 3, text: "<p>Flugwetter</p>" },
  segelflugForecast: { issueTime: 4, html: "<p>Segelflug</p>" },
};

test("textProduct picks the region of the weather report", () => {
  assert.deepEqual(textProduct(answer, "weather_report", "1"), {
    html: "<p>Süd</p>",
    issueTime: 1,
  });
  assert.deepEqual(textProduct(answer, "weather_report", "2"), {
    html: null,
    issueTime: 1,
  });
});

test("textProduct falls back from the paragliding to the flying forecast", () => {
  assert.equal(
    textProduct(answer, "gleitschirm", "0").html,
    "<p>Flugwetter</p>",
  );
  assert.equal(textProduct(answer, "segelflug", "0").html, "<p>Segelflug</p>");
  assert.equal(textProduct(answer, "general", "0").issueTime, 2);
});

test("textProduct gives nothing for a missing or odd answer", () => {
  for (const bad of [null, "x", {}, { forecast: { text: "no" } }])
    assert.deepEqual(textProduct(bad, "weather_report", "0"), {
      html: null,
      issueTime: null,
    });
});

test("localeFor maps the UI languages, German by default", () => {
  assert.equal(localeFor("fr"), "fr-CH");
  assert.equal(localeFor("en"), "en-GB");
  assert.equal(localeFor("xx"), "de-CH");
});

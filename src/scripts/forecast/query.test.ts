import assert from "node:assert/strict";
import { test } from "node:test";
import { readChoice, readStation, withParams } from "./query.ts";
import { TEXT_CATEGORIES } from "./text.ts";

test("readChoice accepts only the allowed values", () => {
  assert.equal(
    readChoice("?cat=segelflug", "cat", TEXT_CATEGORIES),
    "segelflug",
  );
  assert.equal(readChoice("?cat=<x>", "cat", TEXT_CATEGORIES), null);
  assert.equal(readChoice("", "cat", TEXT_CATEGORIES), null);
});

test("readStation matches a catalogue name, ignoring case", () => {
  const stations = [{ name: "Disentis/Mustér" }, { name: "Sion" }];
  assert.equal(readStation("?station=sion", stations)?.name, "Sion");
  assert.equal(
    readStation("?station=Disentis%2FMust%C3%A9r", stations)?.name,
    "Disentis/Mustér",
  );
  assert.equal(readStation("?station=Atlantis", stations), null);
  assert.equal(readStation("", stations), null);
});

test("withParams sets and removes keys, keeping the rest", () => {
  assert.equal(
    withParams("https://x.test/forecast/emagram/?a=1#h", {
      station: "Sion",
      b: null,
    }),
    "/forecast/emagram/?a=1&station=Sion#h",
  );
  assert.equal(
    withParams("https://x.test/forecast/?cat=general", { cat: null }),
    "/forecast/",
  );
});

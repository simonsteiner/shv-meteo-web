import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handoffUrl,
  readHandoff,
  withoutHandoff,
  type Handoff,
} from "./handoff.ts";

const search = (url: string) => url.slice(url.indexOf("?"));

test("each handoff round-trips through its URL", () => {
  const handoffs: Handoff[] = [
    { station: "meteo_swiss:KLO" },
    { station: "mistral:dpcn-piemonte:46.30361,8.36639" },
    { webcam: "abufdalp:bielen-startplatz" },
    { locate: true },
  ];
  for (const h of handoffs) {
    const url = handoffUrl(h);
    assert.ok(url.startsWith("/map/?"), url);
    assert.deepEqual(readHandoff(search(url)), h);
  }
});

test("the id is encoded in the URL", () => {
  assert.equal(
    handoffUrl({ station: "meteo_swiss:KLO" }),
    "/map/?station=meteo_swiss%3AKLO",
  );
  assert.equal(handoffUrl({ locate: true }), "/map/?locate");
});

test("unknown or malformed parameters are ignored", () => {
  assert.equal(readHandoff(""), null);
  assert.equal(readHandoff("?foo=bar"), null);
  assert.equal(readHandoff("?station="), null);
  assert.equal(readHandoff("?station=KLO"), null);
  assert.equal(readHandoff("?station=meteo_swiss%3A..%2Fx%2Fy"), null);
  assert.equal(readHandoff("?webcam=a%20b%3Ac"), null);
  assert.equal(readHandoff("?locate=1"), null);
  // a bad escape is decoded leniently, so only the missing colon rejects it
  assert.equal(readHandoff("?station=%E0%A4%A"), null);
  assert.equal(readHandoff(`?station=a:${"x".repeat(101)}`), null);
});

test("the first valid parameter wins", () => {
  assert.deepEqual(readHandoff("?foo=1&station=bad&webcam=a:b&locate"), {
    webcam: "a:b",
  });
});

test("withoutHandoff drops only the handoff parameters", () => {
  assert.equal(
    withoutHandoff("http://x/map/?station=a%3Ab&lang=fr#top"),
    "/map/?lang=fr#top",
  );
  assert.equal(withoutHandoff("http://x/map/?locate"), "/map/");
});

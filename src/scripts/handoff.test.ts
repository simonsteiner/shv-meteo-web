import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handoffUrl,
  readHandoff,
  readZoom,
  withoutHandoff,
  type Handoff,
} from "./handoff.ts";

const search = (url: string) => url.slice(url.indexOf("?"));
const SITE = "3b6f0f3a-e864-4d7c-870b-294927bd6753";

test("each handoff round-trips through its URL", () => {
  const handoffs: Handoff[] = [
    { station: "meteo_swiss:KLO" },
    { station: "mistral:dpcn-piemonte:46.30361,8.36639" },
    { webcam: "abufdalp:bielen-startplatz" },
    { site: SITE },
    { locate: true },
  ];
  for (const h of handoffs) {
    const url = handoffUrl(h);
    assert.ok(url.startsWith("/map/?"), url);
    assert.deepEqual(readHandoff(search(url)), h);
    assert.equal(readZoom(search(url)), null);
  }
});

test("the id is encoded in the URL", () => {
  assert.equal(
    handoffUrl({ station: "meteo_swiss:KLO" }),
    "/map/?station=meteo_swiss%3AKLO",
  );
  assert.equal(handoffUrl({ locate: true }), "/map/?locate");
  assert.equal(handoffUrl({ site: SITE }), `/map/?site=${SITE}`);
});

test("a zoom rides along with a handoff or alone", () => {
  const url = handoffUrl({ site: SITE }, 13);
  assert.equal(url, `/map/?site=${SITE}&z=13`);
  assert.deepEqual(readHandoff(search(url)), { site: SITE });
  assert.equal(readZoom(search(url)), 13);
  assert.equal(handoffUrl(null, 11), "/map/?z=11");
  assert.equal(readZoom("?z=11"), 11);
  assert.equal(handoffUrl(null), "/map/");
});

test("a zoom outside the map's range or not a whole number is ignored", () => {
  for (const z of ["6", "19", "12.5", "-8", "1e1", "", "x", "012x"])
    assert.equal(readZoom(`?z=${z}`), null, z);
  assert.equal(readZoom("?z=7"), 7);
  assert.equal(readZoom("?z=18"), 18);
});

test("unknown or malformed parameters are ignored", () => {
  assert.equal(readHandoff(""), null);
  assert.equal(readHandoff("?foo=bar"), null);
  assert.equal(readHandoff("?station="), null);
  assert.equal(readHandoff("?station=KLO"), null);
  assert.equal(readHandoff("?station=meteo_swiss%3A..%2Fx%2Fy"), null);
  assert.equal(readHandoff("?webcam=a%20b%3Ac"), null);
  // the Function would answer a provider with a digit or hyphen a 400
  assert.equal(readHandoff("?station=meteo-swiss2%3AKLO"), null);
  assert.equal(readHandoff("?locate=1"), null);
  assert.equal(readHandoff("?site="), null);
  assert.equal(readHandoff("?site=a%2Fb"), null);
  assert.equal(readHandoff("?site=%3Cimg%20onerror%3D1%3E"), null);
  assert.equal(readHandoff(`?site=${"x".repeat(65)}`), null);
  // a bad escape is decoded leniently, so only the missing colon rejects it
  assert.equal(readHandoff("?station=%E0%A4%A"), null);
  assert.equal(readHandoff(`?station=a:${"x".repeat(101)}`), null);
});

test("the first valid parameter wins", () => {
  assert.deepEqual(readHandoff("?foo=1&station=bad&webcam=a:b&locate"), {
    webcam: "a:b",
  });
  assert.deepEqual(readHandoff(`?site=${SITE}&station=a:b`), { site: SITE });
});

test("withoutHandoff drops only the handoff parameters and the zoom", () => {
  assert.equal(
    withoutHandoff("http://x/map/?station=a%3Ab&lang=fr#top"),
    "/map/?lang=fr#top",
  );
  assert.equal(withoutHandoff("http://x/map/?locate"), "/map/");
  assert.equal(withoutHandoff(`http://x/map/?site=${SITE}&z=12`), "/map/");
});

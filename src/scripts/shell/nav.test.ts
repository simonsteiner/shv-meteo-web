import assert from "node:assert/strict";
import { test } from "node:test";
import { resetsMap, tabCurrent, type LinkClick } from "./nav.ts";

const plain: LinkClick = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

test("a plain primary click on the Map link resets the map, only on the map", () => {
  assert.equal(resetsMap(plain, "map"), true);
  assert.equal(resetsMap(plain, "weather"), false);
});

test("a modified, non-primary or prevented click leaves the map as it is", () => {
  const clicks: Partial<LinkClick>[] = [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { button: 2 },
    { defaultPrevented: true },
  ];
  for (const click of clicks)
    assert.equal(resetsMap({ ...plain, ...click }, "map"), false);
});

test("the tab's own URL is the page; a section of it is only current", () => {
  assert.equal(tabCurrent("forecast", "forecast", "/forecast/"), "page");
  assert.equal(tabCurrent("forecast", "forecast", "/forecast"), "page");
  assert.equal(tabCurrent("map", "map", "/map/index.html"), "page");
  assert.equal(
    tabCurrent("forecast", "forecast", "/forecast/emagram/"),
    "true",
  );
  assert.equal(tabCurrent("map", "forecast", "/forecast/"), undefined);
});

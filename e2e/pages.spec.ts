// Every page loads under its CSP with no uncaught error, and links
// leaflet.css only where a Leaflet map can be drawn (ADR 0001 and S8 of
// docs/arch-review/2026-11-25-routes-and-page-scripts/).
import { expect, test } from "@playwright/test";
import { watch } from "./page.ts";

const PAGES: { path: string; leaflet: boolean }[] = [
  { path: "/map/", leaflet: true },
  { path: "/weather/", leaflet: false },
  { path: "/forecast/", leaflet: true },
  { path: "/forecast/outlooks/", leaflet: true },
  { path: "/forecast/emagram/", leaflet: true },
  { path: "/forecast/isobaren/", leaflet: true },
  { path: "/safety/", leaflet: false },
];

for (const { path, leaflet } of PAGES)
  test(`${path} loads with no CSP violation or uncaught error`, async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
    const sheets = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) =>
        links.map((l) => (l as HTMLLinkElement).href.split("/").pop() ?? ""),
      );
    expect(sheets.some((s) => s.startsWith("leaflet."))).toBe(leaflet);
  });

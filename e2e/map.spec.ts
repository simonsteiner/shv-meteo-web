// The map's load-status line through its page wiring (src/scripts/maps/
// page.ts), which session.test.ts can't reach: a nested render started by
// the obstacle layer must not be overwritten by the outer one's stale
// status (the bug #68's review found).
import { expect, test, type Page } from "@playwright/test";
import { map as strings } from "../src/scripts/i18n/map/de.ts";
import { watch } from "./page.ts";

const OBSTACLES = strings.dataset.obstacles;

/** Open the layers drawer and set the obstacle switch of the shown tab. */
async function setObstacles(page: Page, on: boolean): Promise<void> {
  const drawer = page.locator("[data-drawer]");
  if (await drawer.isHidden())
    await page.locator('[data-action="toggle-drawer"]').click();
  const box = page.locator('input[data-layer="obstacles"]');
  // the input hides behind its switch, so a pilot clicks the label
  const label = drawer
    .locator("[data-pane]:not(.hidden) label")
    .filter({ has: box });
  if ((await label.locator("input").isChecked()) !== on) await label.click();
  await expect(label.locator("input")).toBeChecked({ checked: on });
  await page.locator('[data-action="close-drawer"]').first().click();
}

/** The zooms the base map's tiles are drawn at (its URLs end
 * `/<z>/<x>/<y>.<ext>`). */
function tileZooms(page: Page): Promise<string[]> {
  return page
    .locator("img.leaflet-tile")
    .evaluateAll((tiles) => [
      ...new Set(
        tiles.map(
          (t) =>
            /\/(\d+)\/\d+\/\d+\.\w+$/.exec((t as HTMLImageElement).src)?.[1] ??
            "",
        ),
      ),
    ]);
}

/** Zoom out one step and wait until only the new zoom's tiles are left. */
async function zoomOutTo(page: Page, zoom: number): Promise<void> {
  await page.locator(".leaflet-control-zoom-out").click();
  await expect.poll(() => tileZooms(page)).toEqual([String(zoom)]);
}

test("a failed obstacle load is forgotten once none are shown", async ({
  page,
}) => {
  const problems = await watch(page);
  // no shards: the index read fails, as it does without npm run obstacles
  await page.route("**/data/obstacles/**", (r) => r.fulfill({ status: 404 }));
  await page.goto("/map/?z=9");
  const status = page.locator("[data-map-status]");

  await setObstacles(page, true);
  await expect(status).toContainText(OBSTACLES);

  await setObstacles(page, false);
  await expect(status).not.toContainText(OBSTACLES);

  // below OBSTACLE_MIN_ZOOM (8) the layer shows none, so none are missing
  await zoomOutTo(page, 8);
  await zoomOutTo(page, 7);
  await setObstacles(page, true);
  await expect(status).not.toContainText(OBSTACLES);
  expect(problems).toEqual([]);
});

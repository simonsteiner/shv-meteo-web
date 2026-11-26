// The DABS card is a reminder with links that work: nothing is fetched, so
// it claims no status and no validity (the no-synthesized-data rule).
// Tomorrow's PDF shows from 16:00 Swiss time, when skybriefing publishes it.
import { expect, test } from "@playwright/test";

test("the DABS card links today's PDF and the bulletin page, and claims no status", async ({
  page,
}) => {
  // 10:00 in Zurich: tomorrow's bulletin isn't out
  await page.clock.setFixedTime(new Date("2026-11-25T09:00:00Z"));
  await page.goto("/safety/");
  const card = page.locator("#dabs");
  const visible = await card
    .locator("a:visible")
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(visible).toEqual([
    "https://www.skybriefing.com/de/dabs",
    "https://www.skybriefing.com/o/dabs?today",
  ]);
  await expect(card.locator(".status-indicator-dot")).toHaveCount(0);
  await expect(card).not.toContainText("23:59");
});

test("tomorrow's DABS PDF shows from 16:00 Swiss time", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-25T15:30:00Z"));
  await page.goto("/safety/");
  await expect(
    page.locator('#dabs a[href="https://www.skybriefing.com/o/dabs?tomorrow"]'),
  ).toBeVisible();
});

test("the DABS card shows skybriefing's publication times and the next one", async ({
  page,
}) => {
  // 10:00 in Zurich: the next publication is the 13:00 update
  await page.clock.setFixedTime(new Date("2026-11-25T09:00:00Z"));
  await page.goto("/safety/");
  const card = page.locator("#dabs");
  await expect(card.locator(".dabs-schedule-list")).toContainText("16:00 LT");
  await expect(card.locator(".dabs-schedule-list")).toContainText(
    "09:00, 13:00, 16:00 LT",
  );
  await expect(card.locator("[data-dabs-next]")).toHaveText(
    "Nächste Publikation: 13:00 LT",
  );
  await expect(card).toContainText(
    "Vor jedem Streckenflug obligatorisch zu konsultieren!",
  );
});

test("the safety page has no vario simulator or logbook, the header no login button", async ({
  page,
}) => {
  await page.goto("/safety/");
  await expect(page.locator("[data-vario-slider], [data-flights]")).toHaveCount(
    0,
  );
  await expect(page.locator('a[href*="shv-fsvl.ch"]')).toHaveCount(0);
});

test("after 16:00 the next publication is tomorrow's first update", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-25T17:00:00Z"));
  await page.goto("/safety/");
  await expect(page.locator("[data-dabs-next]")).toHaveText(
    "Nächste Publikation: morgen 09:00 LT",
  );
});

// The DABS card is a reminder with links that work: nothing is fetched, so
// it claims no status and no validity (the no-synthesized-data rule).
import { expect, test } from "@playwright/test";

test("the DABS card links today's and tomorrow's PDF and the bulletin page, and claims no status", async ({
  page,
}) => {
  await page.goto("/safety/");
  const card = page.locator("#dabs");
  const links = await card
    .locator("a")
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(links).toEqual([
    "https://www.skybriefing.com/de/dabs",
    "https://www.skybriefing.com/o/dabs?today",
    "https://www.skybriefing.com/o/dabs?tomorrow",
  ]);
  await expect(card.locator(".status-indicator-dot")).toHaveCount(0);
  await expect(card).not.toContainText("23:59");
});

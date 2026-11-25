// The station pair's retry through the weather page (src/scripts/weather/
// page.ts over pair-state.ts): after a failed first report the retry button
// shows, a retry in flight marks it busy and asks once however often it is
// clicked, and a report that comes takes the button away.
import { expect, test } from "@playwright/test";
import { watch } from "./page.ts";

/** A report with no pairs and no history: the empty answer, not a made-up
 * reading, which is all the retry needs to see come back. */
const EMPTY_REPORT = {
  primaryPair: null,
  pairs: [],
  geoJson: { type: "FeatureCollection", features: [] },
  history: [],
  thresholds: { moderateThresholdHpa: 4, severeThresholdHpa: 8 },
  updatedAt: new Date().toISOString(),
};

test("a retry asks once, marks the button busy, and hides it on a report", async ({
  page,
}) => {
  const problems = await watch(page);
  let failing = true;
  let release = (): void => {};
  const released = new Promise<void>((r) => (release = r));
  let asked = 0;
  await page.route("**/api/foehn*", async (route) => {
    if (failing) return route.fulfill({ status: 503, body: "{}" });
    asked++;
    await released;
    await route.fulfill({ json: EMPTY_REPORT });
  });
  await page.goto("/weather/");
  const retry = page.locator("[data-foehn-retry]");
  await expect(retry).toBeVisible();
  await expect(retry).toHaveAttribute("aria-disabled", "false");

  failing = false;
  await retry.click();
  await expect(retry).toHaveAttribute("aria-disabled", "true");
  // aria-disabled doesn't stop a click, so a pilot's clicks still land
  await retry.click({ force: true });
  await retry.click({ force: true });
  release();
  await expect(retry).toBeHidden();
  expect(asked).toBe(1);
  expect(problems).toEqual([]);
});

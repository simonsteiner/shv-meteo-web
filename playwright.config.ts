// Browser tests over the built site, as Pages serves it (e2e/): every page
// under its CSP, and the page wiring no unit test reaches. Build first:
//   npm run build && npm run e2e
// The server is `npm run preview` (wrangler pages dev dist on 8788), reused
// when one is already running.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:8788",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:8788/map/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

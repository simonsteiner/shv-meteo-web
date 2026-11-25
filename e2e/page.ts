// What every browser test starts from: the browser reaches only the site
// under test (map tiles, CDN snapshots and direct upstreams are refused, so
// a run doesn't depend on them), and the errors that must fail a test are
// collected: uncaught errors, the shell's global error logs
// (src/scripts/shell/errors.ts) and CSP violations. A data read that fails
// and is logged (`[ShvApi.getFoehn] ...`) is the app's empty state at work,
// not a failure.
import type { Page } from "@playwright/test";

const SITE = "http://localhost:8788";

export async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`uncaught: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (
      text.startsWith("[Global Error]") ||
      text.startsWith("[Unhandled Promise Rejection]") ||
      text.includes("Content Security Policy")
    )
      problems.push(text);
  });
  await page.addInitScript(() => {
    addEventListener("securitypolicyviolation", (e) =>
      console.error(
        `Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
  });
  await page.route(
    (url) => url.origin !== SITE,
    (route) => route.abort("blockedbyclient"),
  );
  return problems;
}

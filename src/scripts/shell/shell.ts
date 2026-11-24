// The script every page loads first (src/layouts/Base.astro): the global
// error loggers, the back/forward cache reload and the header and bottom
// nav. Each tab's own script then drives its page.

import "./errors.ts";
import { mountShell } from "./header.ts";

// A page restored from the back/forward cache holds the settings it had
// when left, and its setters would write them back over what another page
// saved since; reload it from storage instead.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});

const header = document.querySelector<HTMLElement>("[data-shell-header]");
if (header) mountShell(header);
else console.error("[shell] The page has no [data-shell-header]");

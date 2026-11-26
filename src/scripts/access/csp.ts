// The Content Security Policy every built page carries as a meta tag. At
// `astro:build:done` it hashes (sha256, base64) the body of each inline
// script the page ships, so those run and nothing else inline does: no
// injected `<script>`, no `onerror=` handler. Styles may stay inline, as
// Leaflet and Chart.js set style attributes. `frame-ancestors` (ignored in a
// meta tag), Referrer-Policy and nosniff are in public/_headers.
// Chosen over Astro's built-in `security.csp` because it is known to hash
// every inline script the pages ship; the built-in can replace it later with
// the same policy.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

/** Script types that hold data, not code, so they need no hash. */
const DATA_TYPES = new Set(["application/json", "application/ld+json"]);

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const META_CHARSET = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i;

function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(
    `(?:^|\\s)${name}(?=[\\s=/>]|$)(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`,
    "i",
  ).exec(attrs);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? "").trim().toLowerCase();
}

/** The CSP source of each inline script's body in `html`, in page order:
 * `'sha256-<base64>'`. A script with `src`, or one of a JSON type, has
 * none. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (attribute(attrs, "src") !== null) continue;
    if (DATA_TYPES.has(attribute(attrs, "type") ?? "")) continue;
    const digest = createHash("sha256").update(body, "utf8").digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }
  return Array.from(new Set(hashes));
}

/** The policy for a page whose inline scripts have `hashes`. */
export function policy(hashes: readonly string[]): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // /api and public/ on 'self'; the outlooks' index and the GIS snapshots'
    // fallbacks straight from upstream (ShvApi in api.ts); images, webcams
    // and map tiles included, stay under img-src
    "connect-src 'self' https://static-prod.ubmeteo.io https://shv-app-static-prod.ubmeteo.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ["script-src 'self'", ...hashes].join(" "),
  ].join("; ");
}

/** `html` with its meta CSP right after `<meta charset>`, before any
 * script; a page without `<meta charset>` is a build bug, so it throws. */
export function withCsp(html: string): string {
  const charset = META_CHARSET.exec(html);
  if (!charset) throw new Error("[csp] The page has no <meta charset>");
  const meta = `<meta http-equiv="content-security-policy" content="${policy(inlineScriptHashes(html))}">`;
  const at = charset.index + charset[0].length;
  return html.slice(0, at) + meta + html.slice(at);
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => join(e.parentPath, e.name));
}

/** The integration for astro.config.mjs: writes the meta CSP into every
 * built page. */
export function csp(): AstroIntegration {
  return {
    name: "csp",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const files = await htmlFiles(fileURLToPath(dir));
        for (const file of files)
          await writeFile(file, withCsp(await readFile(file, "utf8")));
        logger.info(`meta CSP written into ${files.length} pages`);
      },
    },
  };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { inlineScriptHashes, policy, withCsp } from "./csp.ts";

const sha = (body: string) =>
  `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

const THEME = `
      try { document.documentElement.dataset.theme = "light"; } catch (e) {}
    `;

const PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>x</title>
<script>${THEME}</script>
<script type="module" src="/_astro/page.js"></script>
<script type="application/json">{"a":1}</script>
<script type="application/ld+json">{"@type":"Thing"}</script>
</head><body><script type="module">import "/x.js";</script></body></html>`;

test("every inline script gets its hash; src and JSON scripts get none", () => {
  assert.deepEqual(inlineScriptHashes(PAGE), [
    sha(THEME),
    sha('import "/x.js";'),
  ]);
});

test("an attribute that only starts with src or type doesn't count", () => {
  assert.deepEqual(
    inlineScriptHashes(
      '<script srcfoo="/x.js">b()</script>' +
        '<script typex type="application/json">{"a":1}</script>',
    ),
    [sha("b()")],
  );
});

test("a script that appears twice is hashed once", () => {
  assert.deepEqual(
    inlineScriptHashes("<script>a()</script><script>a()</script>"),
    [sha("a()")],
  );
});

test("the meta lands right after <meta charset>, before any script", () => {
  const html = withCsp(PAGE);
  const meta = html.indexOf('<meta http-equiv="content-security-policy"');
  assert.equal(meta, html.indexOf('<meta charset="UTF-8">') + 22);
  assert.ok(meta < html.indexOf("<script"));
  assert.ok(html.includes(`script-src 'self' ${sha(THEME)} `));
});

test("the policy allows only what the pages load", () => {
  const p = policy([]);
  assert.ok(p.includes("default-src 'self'"));
  assert.ok(p.includes("object-src 'none'"));
  assert.ok(p.includes("img-src 'self' data: blob: https:"));
  assert.ok(p.endsWith("script-src 'self'"));
  assert.ok(!/script-src[^;]*unsafe/.test(p));
});

test("a page without <meta charset> throws", () => {
  assert.throws(() => withCsp("<html><head></head></html>"), /meta charset/);
});

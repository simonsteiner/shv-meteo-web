import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";
import { sanitizeForecastHtml, type ParseHtml } from "./sanitize.ts";

// linkedom, unlike a browser, doesn't wrap a fragment in html and body
// (and keeps only its first element), so fragments get the wrapper here
const parse: ParseHtml = (html) =>
  new DOMParser().parseFromString(
    /<html/i.test(html)
      ? html
      : `<html><head></head><body>${html}</body></html>`,
    "text/html",
  ) as unknown as Document;
const clean = (html: string) => sanitizeForecastHtml(html, parse);

test("keeps the elements the forecasts use, without attributes", () => {
  assert.equal(
    clean(
      '<html><head><meta charset="UTF-8"><style>body{user-select:none}</style></head>' +
        '<body><h2 class="t">Heute</h2><p style="x">Sonnig, <b>warm</b><br/>und <strong>trocken</strong></p><div><h3>Morgen</h3></div></body></html>',
    ),
    "<h2>Heute</h2><p>Sonnig, <b>warm</b><br>und <strong>trocken</strong></p><div><h3>Morgen</h3></div>",
  );
});

test("drops scripts and event handlers", () => {
  const out = clean(
    '<p>a<img src=x onerror="alert(1)">b</p><script>alert(2)</script><p onclick="alert(3)">c</p>',
  );
  assert.equal(out, "<p>ab</p><p>c</p>");
  assert.ok(!out.includes("alert"));
});

test("unwraps other elements to their text, escaped", () => {
  assert.equal(
    clean(
      '<p><a href="javascript:alert(1)">Link</a> <span>&lt;x&gt; &amp; y</span></p>',
    ),
    "<p>Link &lt;x&gt; &amp; y</p>",
  );
  assert.equal(clean("<ul><li>eins</li></ul>"), "eins");
});

test("an empty input gives an empty string", () => {
  assert.equal(clean(""), "");
});

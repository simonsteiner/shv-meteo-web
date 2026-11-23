import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml } from "./escape.ts";

test("escapeHtml turns markup into text", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;",
  );
  assert.equal(escapeHtml("Fiesch & Kühboden"), "Fiesch &amp; Kühboden");
});

test("escapeHtml escapes the ampersand first, so entities don't double", () => {
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
});

test("escapeHtml gives an empty string for missing values and keeps 0", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(12.5), "12.5");
});

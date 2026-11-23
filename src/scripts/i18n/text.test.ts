import assert from "node:assert/strict";
import { test } from "node:test";
import { applyText, fill, lookup, type TextTarget } from "./text.ts";

const dict = { safety: { p1: "Gurtzeug", nested: { title: "Titel" } } };

test("lookup follows a dotted key to a string", () => {
  assert.equal(lookup(dict, "safety.p1"), "Gurtzeug");
  assert.equal(lookup(dict, "safety.nested.title"), "Titel");
});

test("lookup gives null for a missing key, an object or an inherited name", () => {
  assert.equal(lookup(dict, "safety.p9"), null);
  assert.equal(lookup(dict, "safety"), null);
  assert.equal(lookup(dict, "safety.p1.more"), null);
  assert.equal(lookup(dict, "toString"), null);
});

function element(attrs: Record<string, string>): TextTarget & {
  attrs: Record<string, string>;
} {
  return {
    attrs,
    textContent: "old",
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute(name, value) {
      attrs[name] = value;
    },
  };
}

test("applyText fills text and attributes and leaves a missing key alone", () => {
  const label = element({ "data-t": "safety.p1" });
  const input = element({ "data-t-placeholder": "safety.nested.title" });
  const gap = element({ "data-t": "safety.p9" });
  const all = [label, input, gap];
  const root = {
    querySelectorAll: (selector: string) =>
      all.filter((el) => selector.slice(1, -1) in el.attrs),
  };
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    applyText(root, dict);
  } finally {
    console.error = original;
  }
  assert.equal(label.textContent, "Gurtzeug");
  assert.equal(input.attrs.placeholder, "Titel");
  assert.equal(gap.textContent, "old");
  assert.equal(errors.length, 1);
});

test("fill replaces named placeholders and leaves unknown ones", () => {
  assert.equal(
    fill("Intervall {n} von {total}", { n: 2, total: 23 }),
    "Intervall 2 von 23",
  );
  assert.equal(fill("{name} {missing}", { name: "Sion" }), "Sion {missing}");
});

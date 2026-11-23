// The text forecasts arrive as whole HTML documents from upstream. Only
// the handful of elements they use survive (p, b, strong, br, div, h1 to
// h3), with no attributes; head, style, meta and script go with their
// content, and every other element is unwrapped to its text. The parser
// is a parameter: the browser passes DOMParser, the tests linkedom.

import { escapeHtml } from "../escape.ts";

export type ParseHtml = (html: string) => Document;

const KEEP = new Set(["p", "b", "strong", "br", "div", "h1", "h2", "h3"]);
const DROP = new Set(["head", "style", "meta", "script", "title"]);
const ELEMENT = 1;
const TEXT = 3;

function serialize(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT) {
      out += escapeHtml(child.textContent);
    } else if (child.nodeType === ELEMENT) {
      const tag = (child as Element).tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      const inner = serialize(child);
      if (tag === "br") out += "<br>";
      else if (KEEP.has(tag)) out += `<${tag}>${inner}</${tag}>`;
      else out += inner;
    }
    // comments, doctypes and processing instructions are dropped
  }
  return out;
}

/** `html` reduced to the allowed elements, safe to set as innerHTML. */
export function sanitizeForecastHtml(html: string, parse: ParseHtml): string {
  if (!html) return "";
  const doc = parse(html);
  return serialize(doc.body ?? doc.documentElement);
}

/** The browser's parser. */
export const browserParse: ParseHtml = (html) =>
  new DOMParser().parseFromString(html, "text/html");

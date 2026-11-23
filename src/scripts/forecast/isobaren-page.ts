// The isobar chart section (/forecast/isobaren/): the chart's SVG for the
// UI language, swapped when the language changes.

import { store } from "../../state.js";
import { isobarenUrl } from "../api.ts";
import { must } from "../dom.ts";
import { page } from "./page.ts";
import { applyText } from "../i18n/text.ts";
import { storeDictionary } from "../i18n/store.ts";

export function mountIsobaren(root: HTMLElement): void {
  const img = must<HTMLImageElement>(root, "[data-isobaren-img]");
  let lang: string | null = null;
  img.addEventListener("error", () => {
    console.error("[forecast] The isobar chart failed to load:", img.src);
  });
  function render(): void {
    if (store.state.lang === lang) return;
    lang = store.state.lang;
    applyText(page(root), storeDictionary());
    img.src = isobarenUrl(store.state.lang);
  }
  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-forecast-isobaren]");
if (root) mountIsobaren(root);
else console.error("[forecast] The page has no [data-forecast-isobaren] root");

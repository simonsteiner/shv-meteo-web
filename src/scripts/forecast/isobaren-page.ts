// The isobar chart section (/forecast/isobaren/): the chart's SVG for the
// UI language, swapped when the language changes, and zoomed on a tap.

import { store } from "../state.ts";
import { isobarenUrl } from "../api.ts";
import { must } from "../dom.ts";
import { page } from "./page.ts";
import { applyText } from "../i18n/text.ts";
import { storeDictionary } from "../i18n/store.ts";
import { keepPoint, zoomedWidth } from "./isobaren-zoom.ts";

/** Upstream's SVG declares this width. */
const NATURAL_WIDTH = 1168;

export function mountIsobaren(root: HTMLElement): void {
  const img = must<HTMLImageElement>(root, "[data-isobaren-img]");
  const zoom = must<HTMLButtonElement>(root, "[data-isobaren-zoom]");
  const box = must<HTMLElement>(root, "[data-isobaren-box]");
  const hint = must<HTMLElement>(root, "[data-isobaren-hint]");
  const scroller = page(root);
  let lang: string | null = null;
  img.addEventListener("error", () => {
    console.error("[forecast] The isobar chart failed to load:", img.src);
  });

  function showHint(): void {
    const zoomed = zoom.getAttribute("aria-pressed") === "true";
    hint.textContent = zoomed
      ? store.t.forecast.isobarenZoomOut
      : store.t.forecast.isobarenZoomIn;
  }

  zoom.addEventListener("click", (event) => {
    const before = img.getBoundingClientRect();
    const zoomed = zoom.getAttribute("aria-pressed") === "true";
    // a keyboard click has no position; zoom around the chart's middle
    const tap =
      event.detail > 0
        ? { x: event.clientX, y: event.clientY }
        : {
            x: before.left + before.width / 2,
            y: before.top + before.height / 2,
          };
    const point = { x: tap.x - before.left, y: tap.y - before.top };
    const padding = parseFloat(getComputedStyle(box).paddingLeft) || 0;
    const viewX = tap.x - box.getBoundingClientRect().left - padding;
    // read before the resize: a shorter page clamps scrollTop on zoom-out
    const top = scroller.scrollTop;
    zoom.style.width = zoomed
      ? ""
      : `${zoomedWidth(before.width, NATURAL_WIDTH)}px`;
    zoom.setAttribute("aria-pressed", String(!zoomed));
    const after = img.getBoundingClientRect().width;
    const { left, down } = keepPoint(point, after / before.width, viewX);
    box.scrollLeft = left;
    scroller.scrollTop = top + down;
    showHint();
  });

  function render(): void {
    if (store.state.lang === lang) return;
    lang = store.state.lang;
    applyText(page(root), storeDictionary());
    img.src = isobarenUrl(store.state.lang);
    showHint();
  }
  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-forecast-isobaren]");
if (root) mountIsobaren(root);
else console.error("[forecast] The page has no [data-forecast-isobaren] root");

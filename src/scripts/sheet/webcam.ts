// A webcam's sheet: name, place, its latest image (the thumbnail when that
// fails, a notice when both do), the time-lapse toggle and the source
// link. The image swaps happen in render.ts, from the data attributes.

import { escapeHtml } from "../escape.ts";
import type { Say } from "../i18n/text.ts";
import { webcamImages, webcamSubtitle } from "../maps/webcams.ts";
import type { Webcam } from "../types.ts";
import { ICON, sheetHtml } from "./parts.ts";

/** The notice an image's place shows when there is none to show. */
export function noImageHtml(say: Say): string {
  return `<p class="error-notice">${escapeHtml(say("map.sheet.noImage"))}</p>`;
}

export function webcamSheetHtml(w: Webcam, say: Say): string {
  const name =
    (typeof w.name === "string" && w.name) || say("map.sheet.webcam");
  const subtitle = webcamSubtitle(w);
  const img = webcamImages(w);
  const head = `<span class="sheet-badge badge-webcam">${escapeHtml(say("map.sheet.liveWebcam"))}</span><h2 class="sheet-title">${escapeHtml(name)}</h2>${
    subtitle ? `<span class="sheet-sub">${escapeHtml(subtitle)}</span>` : ""
  }`;
  const viewer = img.latest
    ? `<div class="webcam-viewer"><img src="${escapeHtml(img.latest)}" alt="${escapeHtml(name)}" class="webcam-img" loading="eager" data-webcam-img data-latest="${escapeHtml(img.latest)}"${
        img.fallback ? ` data-fallback="${escapeHtml(img.fallback)}"` : ""
      }${img.timelapse ? ` data-timelapse="${escapeHtml(img.timelapse)}"` : ""} /></div>`
    : noImageHtml(say);
  const actions = [
    img.timelapse && img.latest
      ? `<button type="button" class="btn-action btn-secondary" data-action="timelapse" aria-pressed="false">${ICON.play}<span data-timelapse-label>${escapeHtml(say("map.sheet.timelapse"))}</span></button>`
      : "",
    img.source
      ? `<a href="${escapeHtml(img.source)}" target="_blank" rel="noopener" class="btn-action btn-nav"><span>${escapeHtml(say("map.sheet.source"))}</span></a>`
      : "",
  ].join("");
  const body = `${viewer}${actions ? `<div class="sheet-actions webcam-actions">${actions}</div>` : ""}`;
  return sheetHtml({ head, body, label: name, wide: true }, say);
}

// The bottom sheet's DOM: it shows the map's one selection in
// #bottom-sheet-container (src/layouts/Base.astro), closes from its close
// button, its scrim or Escape, and swaps the webcam's image (thumbnail on
// error, time-lapse on demand) without any inline handler.

import type { Say } from "../i18n/text.ts";
import type {
  FlyingSiteFeature,
  MeasurementFeature,
  ObstacleFeature,
  Webcam,
} from "../types.ts";
import { obstacleSheetHtml } from "./obstacle.ts";
import { siteSheetHtml } from "./site.ts";
import { stationSheetHtml } from "./station.ts";
import { noImageHtml, webcamSheetHtml } from "./webcam.ts";

export type Selection =
  | { kind: "site"; value: FlyingSiteFeature }
  | { kind: "station"; value: MeasurementFeature }
  | { kind: "webcam"; value: Webcam }
  | { kind: "obstacle"; value: ObstacleFeature };

export type SelectionKind = Selection["kind"];

/** The selection the store holds (src/scripts/state.ts), at most one. */
export function selectionOf(state: {
  selectedSite: unknown;
  selectedStation: unknown;
  selectedWebcam: unknown;
  selectedObstacle: unknown;
}): Selection | null {
  if (state.selectedSite)
    return { kind: "site", value: state.selectedSite as FlyingSiteFeature };
  if (state.selectedStation)
    return {
      kind: "station",
      value: state.selectedStation as MeasurementFeature,
    };
  if (state.selectedWebcam)
    return { kind: "webcam", value: state.selectedWebcam as Webcam };
  if (state.selectedObstacle)
    return {
      kind: "obstacle",
      value: state.selectedObstacle as ObstacleFeature,
    };
  return null;
}

function sheetFor(
  sel: Selection,
  say: Say,
  names: ReadonlyMap<string, string>,
): string {
  switch (sel.kind) {
    case "site":
      return siteSheetHtml(sel.value, say, names);
    case "station":
      return stationSheetHtml(sel.value, say);
    case "webcam":
      return webcamSheetHtml(sel.value, say);
    case "obstacle":
      return obstacleSheetHtml(sel.value, say);
  }
}

export interface Sheet {
  /** Shows `sel`, or hides the sheet for null. */
  show(
    sel: Selection | null,
    say: Say,
    names: ReadonlyMap<string, string>,
  ): void;
}

export function mountSheet(
  container: HTMLElement,
  close: () => void,
  say: () => Say,
): Sheet {
  let open = false;

  function toggleTimelapse(button: HTMLElement): void {
    const img = container.querySelector<HTMLImageElement>("[data-webcam-img]");
    const label = button.querySelector<HTMLElement>("[data-timelapse-label]");
    if (!img) return;
    const playing = button.getAttribute("aria-pressed") === "true";
    img.src = (playing ? img.dataset.latest : img.dataset.timelapse) ?? img.src;
    button.setAttribute("aria-pressed", String(!playing));
    button.classList.toggle("btn-primary", !playing);
    button.classList.toggle("btn-secondary", playing);
    if (label)
      label.textContent = say()(
        playing ? "map.sheet.timelapse" : "map.sheet.currentImage",
      );
  }

  container.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-sheet-close]")) close();
    const timelapse = target.closest<HTMLElement>('[data-action="timelapse"]');
    if (timelapse) toggleTimelapse(timelapse);
  });
  // error events don't bubble, so they are caught on the way down
  container.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.hasAttribute("data-hide-on-error")) {
        img.hidden = true;
        return;
      }
      if (!img.hasAttribute("data-webcam-img")) return;
      const fallback = img.dataset.fallback;
      if (fallback && img.src !== fallback) {
        img.src = fallback;
        return;
      }
      console.error("[sheet] The webcam has no image to show:", img.src);
      img.parentElement?.insertAdjacentHTML("beforebegin", noImageHtml(say()));
      img.parentElement?.remove();
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) close();
  });

  return {
    show(sel, sayNow, names) {
      open = sel !== null;
      container.classList.toggle("hidden", !open);
      container.innerHTML = sel ? sheetFor(sel, sayNow, names) : "";
    },
  };
}

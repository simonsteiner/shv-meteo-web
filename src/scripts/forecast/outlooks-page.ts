// The outlook section (/forecast/outlooks/): upstream's greyscale frames
// coloured in a canvas (outlooks.ts) over a Swisstopo map, with a player.
// `?type=` opens a product and follows the choice.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { store } from "../state.ts";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import { applyText, fill } from "../i18n/text.ts";
import {
  storeDictionary as dictionary,
  storeSay as say,
} from "../i18n/store.ts";
import {
  colorize,
  colorLut,
  intervalLabel,
  legendGradient,
  OUTLOOK_BOUNDS,
  OUTLOOK_TYPES,
  outlookFrames,
  PRECIP_PALETTE,
  SUNSHINE_PALETTE,
  type OutlookFrame,
  type OutlookType,
} from "./outlooks.ts";
import { page } from "./page.ts";
import { readChoice, withParams } from "./query.ts";
import { stepper } from "./stepper.ts";
import { localeFor } from "./text.ts";

const SWISS_BOUNDS: L.LatLngBoundsExpression = [
  [45.8, 5.9],
  [47.8, 10.5],
];
const PLAY_MS = 1200;
const LEGEND: Record<OutlookType, string> = {
  RELATIVE_SUNSHINE: "forecast.legendSunshine",
  PRECIPITATION_PROBABILITY_WEAK: "forecast.legendPrecipWeak",
  PRECIPITATION_PROBABILITY_STRONG: "forecast.legendPrecipStrong",
};

const luts = {
  sun: colorLut(SUNSHINE_PALETTE),
  rain: colorLut(PRECIP_PALETTE),
};
const coloured = new Map<string, Promise<string>>();

/** A frame coloured through its palette, as a data URL; the plain frame
 * when the canvas can't read it. Each frame is coloured once. */
function colouredFrame(url: string, type: OutlookType): Promise<string> {
  const key = `${type}:${url}`;
  let pending = coloured.get(key);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          colorize(
            data.data,
            type === "RELATIVE_SUNSHINE" ? luts.sun : luts.rain,
          );
          ctx.putImageData(data, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          console.error("[forecast] Cannot colour an outlook frame:", err);
          resolve(url);
        }
      };
      img.onerror = () => {
        console.error("[forecast] An outlook frame failed to load:", url);
        resolve(url);
      };
      img.src = url;
    });
    coloured.set(key, pending);
  }
  return pending;
}

export function mountOutlooks(root: HTMLElement): void {
  let type: OutlookType =
    readChoice(location.search, "type", OUTLOOK_TYPES) ?? "RELATIVE_SUNSHINE";
  let index = 0;
  let frames: OutlookFrame[] = [];
  // undefined while loading, null when the call failed
  let answer: unknown;
  let lang: string | null = null;
  let map: L.Map | null = null;
  let overlay: L.ImageOverlay | null = null;
  const status = must<HTMLElement>(root, "[data-outlook-status]");
  const player = must<HTMLElement>(root, "[data-outlook-player]");
  const slider = must<HTMLInputElement>(root, "[data-outlook-slider]");
  const playButton = must<HTMLButtonElement>(root, "[data-outlook-play]");

  function ensureMap(): L.Map {
    if (map) return map;
    map = L.map(must<HTMLElement>(root, "[data-outlook-map]"), {
      center: [46.8182, 8.2275],
      zoom: 8,
      minZoom: 6,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(
      "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg",
      { maxZoom: 18, attribution: "© swisstopo" },
    ).addTo(map);
    map.fitBounds(SWISS_BOUNDS);
    return map;
  }

  async function showFrame(): Promise<void> {
    const frame = frames[index];
    if (!frame) return;
    const shownType = type;
    const url = await colouredFrame(frame.url, type);
    if (frames[index] !== frame || type !== shownType || !map) return;
    if (overlay) overlay.setUrl(url);
    else
      overlay = L.imageOverlay(url, OUTLOOK_BOUNDS, {
        opacity: 0.85,
        interactive: false,
        className: "outlook-weather-overlay",
      }).addTo(map);
    // the next two frames, so the player doesn't wait for them
    for (const k of [1, 2]) {
      const next = frames[(index + k) % frames.length];
      if (next) void colouredFrame(next.url, type);
    }
  }

  function render(): void {
    if (store.state.lang !== lang) {
      lang = store.state.lang;
      applyText(page(root), dictionary());
    }
    for (const b of root.querySelectorAll<HTMLElement>("[data-type]"))
      b.classList.toggle("active", b.dataset.type === type);
    if (frames.length === 0) {
      player.hidden = true;
      status.hidden = false;
      status.textContent = say(
        answer === undefined
          ? "forecast.loading"
          : "forecast.outlooksUnavailable",
      );
      return;
    }
    status.hidden = true;
    player.hidden = false;
    ensureMap().invalidateSize();
    index = Math.min(index, frames.length - 1);
    must<HTMLElement>(root, "[data-outlook-time]").textContent = intervalLabel(
      frames[index],
      localeFor(store.state.lang),
    );
    must<HTMLElement>(root, "[data-outlook-step]").textContent = fill(
      say("forecast.interval"),
      { n: index + 1, total: frames.length },
    );
    slider.max = String(frames.length - 1);
    slider.value = String(index);
    must<HTMLElement>(root, "[data-outlook-legend-title]").textContent = say(
      LEGEND[type],
    );
    must<HTMLElement>(root, "[data-outlook-legend-bar]").style.background =
      legendGradient(type);
    void showFrame();
  }

  function step(delta: number): void {
    if (frames.length === 0) return;
    index = (index + delta + frames.length) % frames.length;
    render();
  }

  const stepping = stepper(playButton, PLAY_MS, () => step(1));

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const t = target.closest<HTMLElement>("[data-type]")?.dataset.type;
    if (t && (OUTLOOK_TYPES as readonly string[]).includes(t)) {
      type = t as OutlookType;
      index = 0;
      frames = outlookFrames(answer, type);
      history.replaceState(
        history.state,
        "",
        withParams(location.href, {
          type: type === "RELATIVE_SUNSHINE" ? null : type,
        }),
      );
      return render();
    }
    const by = target.closest<HTMLElement>("[data-outlook-step-by]");
    if (by) return step(Number(by.dataset.outlookStepBy));
    if (target.closest("[data-outlook-play]")) {
      return stepping.toggle();
    }
    if (target.closest("[data-outlook-center]")) map?.fitBounds(SWISS_BOUNDS);
  });
  slider.addEventListener("input", () => {
    index = Number(slider.value);
    render();
  });
  window.addEventListener("pagehide", stepping.stop);

  ShvApi.getOutlooks().then((result) => {
    answer = result;
    frames = outlookFrames(result, type);
    render();
  });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-forecast-outlooks]");
if (root) mountOutlooks(root);
else console.error("[forecast] The page has no [data-forecast-outlooks] root");

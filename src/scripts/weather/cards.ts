// The weather page's lists as HTML strings: the pair switcher, the station
// cards and the webcam cards. Every upstream value is escaped; the words
// come in from the dictionary.

import { escapeHtml } from "../escape.ts";
import type { StationPair } from "../foehn/report.ts";
import type { MeasurementFeature, Webcam } from "../types.ts";
import { alertTextClass, formatDelta, pairLabel } from "./pair.ts";
import { stationValues, windClass } from "./stations.ts";
import { webcamImages } from "./webcams.ts";

const DASH = "\u2013";

export function pairPillsHtml(
  pairs: readonly StationPair[],
  selected: string,
): string {
  return pairs
    .map(
      (
        p,
      ) => `<button type="button" data-pair-id="${escapeHtml(p.id)}" class="pair-pill-btn${p.id === selected ? " active" : ""}" aria-pressed="${p.id === selected}">
  <span class="pair-pill-id">${escapeHtml(pairLabel(p.id))}</span>
  <span class="pair-pill-val ${alertTextClass(p.alertLevel)}">${escapeHtml(formatDelta(p.delta))} ${escapeHtml(p.unit)}</span>
</button>`,
    )
    .join("");
}

export interface StationCardText {
  wind: string;
  gust: string;
  temp: string;
  windDirection: string;
}

export function stationCardHtml(
  st: MeasurementFeature,
  text: StationCardText,
): string {
  const p = st.properties;
  const v = stationValues(st);
  const wind = v.windKmh === null ? null : Math.round(v.windKmh);
  const gust = v.gustKmh === null ? null : Math.round(v.gustKmh);
  const dir = v.dirDeg ?? 0;
  // upstream sends 0 for an unknown altitude
  const meta = [
    p.altitude ? `${p.altitude}m` : "",
    (p.providerKey || "Meteo").toUpperCase(),
  ]
    .filter(Boolean)
    .join(" · ");
  return `<div class="station-card-item" role="button" tabindex="0" data-station-id="${escapeHtml(st.id)}">
  <div class="st-card-top">
    <div>
      <h4 class="st-card-name">${escapeHtml(p.name || st.id)}</h4>
      <span class="st-card-alt">${escapeHtml(meta)}</span>
    </div>
    <div class="st-card-arrow" style="transform: rotate(${dir}deg)" title="${escapeHtml(`${text.windDirection} ${Math.round(dir)}°`)}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2L4 20l8-4 8 4z"/></svg>
    </div>
  </div>
  <div class="st-card-stats">
    <div class="st-stat"><span class="st-stat-lbl">${escapeHtml(text.wind)}</span><span class="st-stat-val ${windClass(wind)}">${wind === null ? DASH : `${wind} km/h`}</span></div>
    <div class="st-stat"><span class="st-stat-lbl">${escapeHtml(text.gust)}</span><span class="st-stat-val text-warning">${gust === null ? DASH : `${gust} km/h`}</span></div>
    <div class="st-stat"><span class="st-stat-lbl">${escapeHtml(text.temp)}</span><span class="st-stat-val">${v.tempC === null ? DASH : `${v.tempC}°`}</span></div>
    <div class="st-stat"><span class="st-stat-lbl">QNH</span><span class="st-stat-val">${v.qnhHpa === null ? DASH : v.qnhHpa}</span></div>
  </div>
</div>`;
}

export function webcamCardHtml(w: Webcam): string {
  const { src, fallback } = webcamImages(w);
  const altitude =
    typeof w.altitudeM === "number" ? `${Math.round(w.altitudeM)}m` : "";
  const place =
    (typeof w.location === "string" && w.location) ||
    (typeof w.providerDisplayName === "string" && w.providerDisplayName) ||
    "";
  const img = src
    ? `<img src="${escapeHtml(src)}"${fallback ? ` data-fallback="${escapeHtml(fallback)}"` : ""} alt="${escapeHtml(w.name)}" class="webcam-thumb-img" loading="lazy" />`
    : "";
  return `<div class="webcam-card-item" role="button" tabindex="0" data-webcam-id="${escapeHtml(w.identifier)}">
  <div class="webcam-thumb-container">
    ${img}
    <span class="webcam-alt-tag">${escapeHtml(altitude)}</span>
  </div>
  <div class="webcam-card-meta">
    <h4 class="webcam-title">${escapeHtml(w.name)}</h4>
    <span class="webcam-loc">${escapeHtml(place)}</span>
  </div>
</div>`;
}

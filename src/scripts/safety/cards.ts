// The logbook's cards as an HTML string; every stored value is escaped,
// since the log is free text.

import { escapeHtml } from "../escape.ts";
import type { Flight } from "./flights.ts";

export function flightCardHtml(f: Flight): string {
  const details = [
    `<span>📅 ${escapeHtml(f.date)}</span>`,
    f.glider ? `<span>🪂 ${escapeHtml(f.glider)}</span>` : "",
    f.distance !== null ? `<span>📍 ${escapeHtml(f.distance)} km</span>` : "",
    f.maxAlt !== null ? `<span>⛰️ ${escapeHtml(f.maxAlt)} m</span>` : "",
    f.type ? `<span class="fl-type-pill">${escapeHtml(f.type)}</span>` : "",
  ].join("");
  return `<div class="flight-item-card">
  <div class="fl-top">
    <div>
      <h4 class="fl-site">${escapeHtml(f.site)}</h4>
      ${f.landing ? `<span class="fl-landing">→ ${escapeHtml(f.landing)}</span>` : ""}
    </div>
    <div class="fl-duration-badge"><span>${escapeHtml(f.duration)} min</span></div>
  </div>
  <div class="fl-details">${details}</div>
  ${f.notes ? `<p class="fl-notes">“${escapeHtml(f.notes)}”</p>` : ""}
</div>`;
}

export function flightCardsHtml(flights: readonly Flight[]): string {
  return flights.map(flightCardHtml).join("");
}

// What every bottom sheet shares: the frame with its close button, the
// icons, the coordinates line and the navigation link. Pure HTML strings;
// every upstream value is escaped by the caller or here.

import { escapeHtml } from "../escape.ts";
import { fill, type Say } from "../i18n/text.ts";
import type { LatLngTuple } from "../maps/centroid.ts";

const svg = (size: number, body: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${body}</svg>`;

/** The sheets' icons, Lucide-style strokes. */
export const ICON = {
  mountain: svg(14, '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>'),
  compass: svg(
    14,
    '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  ),
  info: svg(
    16,
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  ),
  wind: svg(
    16,
    '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  ),
  rules: svg(
    16,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  ),
  warning: svg(
    16,
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  ),
  car: svg(
    16,
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  ),
  card: svg(
    16,
    '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  ),
  club: svg(
    16,
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ),
  nav: svg(18, '<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
  phone: svg(
    18,
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  ),
  play: svg(16, '<polygon points="5 3 19 12 5 21 5 3"></polygon>'),
};

/** Upstream text as HTML: escaped, its line breaks kept. */
export function paragraphs(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br/>");
}

/** A position as the sheets show it: `47.0136° N, 8.5856° E`. */
export function coordinatesText(at: LatLngTuple, say: Say): string {
  return fill(say("map.sheet.coordinates"), {
    lat: at[0].toFixed(4),
    lng: at[1].toFixed(4),
  });
}

/** A meta line item under the title. */
export function metaItem(icon: string, text: string): string {
  return `<span class="meta-item">${icon}${escapeHtml(text)}</span>`;
}

/** The coordinates meta item, empty without a position. */
export function coordinatesItem(at: LatLngTuple | null, say: Say): string {
  return at ? metaItem(ICON.compass, coordinatesText(at, say)) : "";
}

/** The button that opens directions to `at` in the device's maps app;
 * empty without a position. */
export function navLink(at: LatLngTuple | null, say: Say): string {
  if (!at) return "";
  return `<a href="https://maps.apple.com/?daddr=${at[0]},${at[1]}" target="_blank" rel="noopener" class="btn-action btn-nav">${ICON.nav}${escapeHtml(say("map.sheet.openInMaps"))}</a>`;
}

/** A sheet section with an icon heading. */
export function section(
  title: string,
  icon: string,
  body: string,
  extraClass = "",
): string {
  return `<div class="sheet-section${extraClass ? ` ${extraClass}` : ""}"><h4 class="section-title">${icon}${escapeHtml(title)}</h4>${body}</div>`;
}

/** A metric card: label, value and an optional line under it. */
export function metric(
  label: string,
  value: string,
  sub = "",
  extraClass = "",
): string {
  return `<div class="metric-card${extraClass ? ` ${extraClass}` : ""}"><span class="metric-lbl">${escapeHtml(label)}</span><span class="metric-val">${escapeHtml(value)}</span>${
    sub ? `<span class="metric-sub">${escapeHtml(sub)}</span>` : ""
  }</div>`;
}

export interface SheetParts {
  /** The title group's HTML: badges, title, meta. */
  head: string;
  body: string;
  /** The sheet's name for assistive technology. */
  label: string;
  wide?: boolean;
}

/** The sheet's frame: the scrim and the panel, both closing it. */
export function sheetHtml(parts: SheetParts, say: Say): string {
  return `<div class="sheet-scrim" data-sheet-close></div><div class="sheet-content${parts.wide ? " sheet-webcam-content" : ""}" role="dialog" aria-label="${escapeHtml(parts.label)}"><div class="sheet-drag-handle"></div><div class="sheet-header"><div class="sheet-title-group">${parts.head}</div><button type="button" class="sheet-close" data-sheet-close aria-label="${escapeHtml(say("map.close"))}">&times;</button></div><div class="sheet-body">${parts.body}</div></div>`;
}

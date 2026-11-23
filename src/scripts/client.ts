// What ShvApi (src/services/api.js) needs no Function for: the outlooks
// and the isobar chart come straight from upstream, and the DABS card is
// built in the browser. Here so node --test reaches it; PR14 folds it into
// src/scripts/api.ts.
import type { Dabs } from "./types.ts";

/** The multi-day outlook frames' index; upstream answers with CORS `*`. */
export const OUTLOOKS_URL =
  "https://static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json";

const ISOBAR_LANGS = ["de", "fr", "it"];

/** The isobar chart's SVG for the UI language; there is no English one, so
 * `en` (and anything unknown) gets German. Only ever used as an `<img>`
 * source, which never runs an SVG's scripts. */
export function isobarenUrl(lang: string): string {
  const l = ISOBAR_LANGS.includes(lang) ? lang : "de";
  return `https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/${l}.svg`;
}

/** Today's date in Switzerland as YYYY-MM-DD, from the parts rather than
 * a locale's layout, which older browsers' ICU data varies. */
function swissDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The DABS card's fields for `now`, as the former /api/dabs returned
 * them, but dated in Swiss time rather than UTC. */
export function buildDabs(now: Date): Dabs {
  const date = swissDate(now);
  return {
    date,
    status: "ACTIVE",
    bulletinUrl: "https://www.skybriefing.com/de/dabs",
    bulletinPdfUrl: "https://www.skybriefing.com/dabs/dabs.pdf",
    validity: `00:00 - 23:59 LT (${date})`,
    notesDe:
      "Täglich ab 16:00 LT für den Folgetag durch Skybriefing publiziert. Vor jedem Streckenflug obligatorisch zu konsultieren!",
    notesEn:
      "Published daily at 16:00 LT for the next day via Skybriefing. Mandatory consultation prior to cross-country flights!",
  };
}

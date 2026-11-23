// A flying site's sheet: kind, difficulty and status badges, elevation and
// position, what it suits, its notices, rules, hazards, access, fees and
// club, and the directions and Rega buttons.

import { text } from "../coerce.ts";
import { escapeHtml, safeUrl } from "../escape.ts";
import { fill, type Say } from "../i18n/text.ts";
import { featureLatLng } from "../maps/centroid.ts";
import { COMPASS } from "../settings.ts";
import type { FlyingSiteFeature } from "../types.ts";
import {
  ICON,
  coordinatesItem,
  metaItem,
  navLink,
  paragraphs,
  section,
  sheetHtml,
} from "./parts.ts";

type Props = FlyingSiteFeature["properties"];

/** The badge a site's type gets: areas count as their take-off or landing. */
export function siteKind(type: unknown): "launch" | "landing" | "general" {
  const t = typeof type === "string" ? type.toLowerCase() : "";
  if (t === "launch" || t === "launcharea") return "launch";
  if (t === "landing" || t === "landingarea" || t === "landingpattern")
    return "landing";
  return "general";
}

const DIFFICULTY_CLASS: Record<string, string> = {
  easy: "badge-diff-easy",
  moderate: "badge-diff-moderate",
  difficult: "badge-diff-difficult",
};

/** What a site suits, in the order the sheet lists them. */
export const SUITABILITY = [
  "paraglider",
  "hangglider",
  "speedflyer",
  "toplanding",
  "soaring",
  "crossCountry",
  "hikeAndFly",
  "groundhandling",
  "accessibleByCar",
  "publicTransport",
] as const;

function badge(cls: string, label: string): string {
  return `<span class="sheet-badge ${cls}">${escapeHtml(label)}</span>`;
}

function badges(p: Props, kind: ReturnType<typeof siteKind>, say: Say): string {
  const out = [
    kind === "general"
      ? badge("badge-general", text(p.type) || say("map.sheet.site"))
      : badge(
          kind === "launch" ? "badge-launch" : "badge-landing",
          say(
            kind === "launch"
              ? "map.sheet.launchBadge"
              : "map.sheet.landingBadge",
          ),
        ),
  ];
  const difficulty = text(p.difficulty).toLowerCase();
  if (difficulty) {
    const known = Object.prototype.hasOwnProperty.call(
      DIFFICULTY_CLASS,
      difficulty,
    );
    out.push(
      badge(
        known ? DIFFICULTY_CLASS[difficulty] : "badge-diff-moderate",
        known ? say(`map.sheet.difficulty.${difficulty}`) : text(p.difficulty),
      ),
    );
  }
  const status = text(p.openingStatus).toLowerCase();
  if (status === "open")
    out.push(badge("badge-status-open", say("map.sheet.open")));
  if (status === "closed")
    out.push(badge("badge-status-closed", say("map.sheet.closed")));
  return `<div class="sheet-badges-row">${out.join("")}</div>`;
}

function fees(p: Props, say: Say): string {
  const pay = safeUrl(p.feePaymentLink);
  const qr = safeUrl(p.feeQrCodeUrl);
  return section(
    say("map.sheet.fees"),
    ICON.card,
    `<p class="section-text">${paragraphs(text(p.fees))}</p>${
      pay
        ? `<div class="fee-action-row"><a href="${escapeHtml(pay)}" target="_blank" rel="noopener" class="btn-action btn-pay"><span>💳</span> ${escapeHtml(say("map.sheet.payFee"))}</a></div>`
        : ""
    }${
      qr
        ? `<div class="fee-qr-wrapper"><img src="${escapeHtml(qr)}" alt="${escapeHtml(say("map.sheet.qrAlt"))}" class="fee-qr-img" /><span class="fee-qr-hint">${escapeHtml(say("map.sheet.qrHint"))}</span></div>`
        : ""
    }`,
    "section-fees",
  );
}

/** The sheet of a take-off or landing. `names` gives a site's name by its
 * `siteId` when the feature lacks one. */
export function siteSheetHtml(
  feature: FlyingSiteFeature,
  say: Say,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const p = feature.properties ?? {};
  const kind = siteKind(p.type);
  const name =
    text(p.siteName) ||
    (p.siteId && names.get(p.siteId)) ||
    text(p.description) ||
    say(
      kind === "launch"
        ? "map.sheet.launch"
        : kind === "landing"
          ? "map.sheet.landing"
          : "map.sheet.site",
    );
  const at = featureLatLng(feature);
  const elevation =
    typeof p.elevation === "number" && p.elevation
      ? fill(say("map.sheet.elevation"), { m: p.elevation })
      : say("map.sheet.noElevation");
  const head = `${badges(p, kind, say)}<h2 class="sheet-title">${escapeHtml(name)}</h2><div class="sheet-meta">${metaItem(ICON.mountain, elevation)}${coordinatesItem(at, say)}</div>`;

  const suits = SUITABILITY.filter((key) => p[key] === true);
  const dirs = Array.isArray(p.launchDirections) ? p.launchDirections : [];
  const block = (
    key: "siteDescription" | "hazards" | "access",
    title: string,
    icon: string,
    cls = "",
  ) =>
    text(p[key])
      ? section(
          say(title),
          icon,
          `<p class="section-text">${paragraphs(text(p[key]))}</p>`,
          cls,
        )
      : "";
  const club = text(p.responsible);
  const clubLink = safeUrl(p.clubLink);

  const body = [
    suits.length
      ? `<div class="suitability-pills-row">${suits
          .map(
            (key) =>
              `<span class="suitability-pill">${escapeHtml(say(`map.sheet.suit.${key}`))}</span>`,
          )
          .join("")}</div>`
      : "",
    text(p.openingInfo)
      ? section(
          say("map.sheet.openingInfo"),
          ICON.info,
          `<p class="section-text">${paragraphs(text(p.openingInfo))}</p>`,
          "section-opening",
        )
      : "",
    kind === "launch" && dirs.length
      ? section(
          say("map.sheet.windSuitable"),
          ICON.wind,
          `<div class="wind-rose-grid">${COMPASS.map(
            (d) =>
              `<span class="wind-tag ${dirs.includes(d) ? "wind-ok" : "wind-no"}">${d}</span>`,
          ).join("")}</div>`,
        )
      : "",
    block("siteDescription", "map.sheet.rules", ICON.rules),
    block("hazards", "map.sheet.hazards", ICON.warning, "section-warning"),
    block("access", "map.sheet.access", ICON.car),
    text(p.fees) ? fees(p, say) : "",
    club
      ? section(
          say("map.sheet.responsible"),
          ICON.club,
          `<div class="club-row"><span class="club-name">${escapeHtml(club)}</span>${
            clubLink
              ? `<a href="${escapeHtml(clubLink)}" target="_blank" rel="noopener" class="btn-link">${escapeHtml(say("map.sheet.website"))}</a>`
              : ""
          }</div>`,
        )
      : "",
    `<div class="sheet-actions">${navLink(at, say)}<a href="tel:1414" class="btn-action btn-sos">${ICON.phone}Rega 1414</a></div>`,
  ].join("");

  return sheetHtml({ head, body, label: name }, say);
}

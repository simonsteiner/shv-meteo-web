// Which text forecast the text section shows: the regional weather report
// (three regions), the paragliding and gliding forecasts, or the general
// situation, each with its issue time.

import { isRecord } from "../coerce.ts";

export const TEXT_CATEGORIES = [
  "weather_report",
  "gleitschirm",
  "segelflug",
  "general",
] as const;
export type TextCategory = (typeof TEXT_CATEGORIES)[number];

/** The weather report's regions: 0 German-speaking Switzerland and
 * Graubünden, 1 the southern side of the Alps and Engadin, 2 Romandy and
 * Valais. */
export const REGIONS = ["0", "1", "2"] as const;
export type Region = (typeof REGIONS)[number];

export interface TextProduct {
  /** Upstream's HTML document, not yet sanitized; null when missing. */
  html: string | null;
  issueTime: number | null;
}

function record(v: unknown): Record<string, unknown> | null {
  return isRecord(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function product(v: unknown): TextProduct {
  const r = record(v);
  return {
    html: str(r?.text) ?? str(r?.html),
    issueTime: typeof r?.issueTime === "number" ? r.issueTime : null,
  };
}

/** The forecast for a category (and region) from the text forecast
 * answer; html null when upstream has none. */
export function textProduct(
  answer: unknown,
  category: TextCategory,
  region: Region,
): TextProduct {
  const tf = record(answer);
  if (category === "weather_report") {
    const forecast = record(tf?.forecast);
    return {
      html: str(record(forecast?.text)?.[region]),
      issueTime:
        typeof forecast?.issueTime === "number" ? forecast.issueTime : null,
    };
  }
  if (category === "gleitschirm")
    return product(tf?.gleitschirmForecast ?? tf?.flugwetterForecast);
  if (category === "segelflug") return product(tf?.segelflugForecast);
  return product(tf?.generalForecast);
}

/** The Intl locale for a UI language. */
export function localeFor(lang: string): string {
  return (
    { de: "de-CH", fr: "fr-CH", it: "it-CH", en: "en-GB" }[lang] ?? "de-CH"
  );
}

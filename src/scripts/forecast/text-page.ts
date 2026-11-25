// The text forecast section (/forecast/): loads the forecasts for the UI
// language, sanitizes upstream's HTML and switches category and region.
// `?cat=` and `?region=` open a forecast and follow the choice.

import { store } from "../state.ts";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import { page } from "./page.ts";
import { applyText } from "../i18n/text.ts";
import {
  storeDictionary as dictionary,
  storeSay as say,
} from "../i18n/store.ts";
import { readChoice, withParams } from "./query.ts";
import { browserParse, sanitizeForecastHtml } from "./sanitize.ts";
import {
  localeFor,
  REGIONS,
  TEXT_CATEGORIES,
  textProduct,
  type Region,
  type TextCategory,
} from "./text.ts";

const TITLE: Record<TextCategory, string> = {
  weather_report: "forecast.titleWeatherReport",
  gleitschirm: "forecast.titleGleitschirm",
  segelflug: "forecast.titleSegelflug",
  general: "forecast.titleGeneral",
};
const EMPTY: Record<TextCategory, string> = {
  weather_report: "forecast.emptyWeatherReport",
  gleitschirm: "forecast.emptyGleitschirm",
  segelflug: "forecast.emptySegelflug",
  general: "forecast.emptyGeneral",
};

export function mountTextForecast(root: HTMLElement): void {
  let category: TextCategory =
    readChoice(location.search, "cat", TEXT_CATEGORIES) ?? "weather_report";
  let region: Region = readChoice(location.search, "region", REGIONS) ?? "0";
  // undefined while loading, null when the call failed
  let answer: unknown;
  let loadedLang: string | null = null;
  let lang: string | null = null;
  // what the section shows; a store change that touches none of it (a
  // theme switch) skips the parse and the innerHTML reset
  let shown: {
    lang: string;
    category: TextCategory;
    region: Region;
    answer: unknown;
  } | null = null;
  const status = must<HTMLElement>(root, "[data-text-status]");
  const card = must<HTMLElement>(root, "[data-text-card]");
  const issued = must<HTMLElement>(root, "[data-text-issued]");

  function load(): void {
    const forLang = store.state.lang;
    loadedLang = forLang;
    answer = undefined;
    ShvApi.getTextForecast(forLang).then((result) => {
      if (loadedLang !== forLang) return;
      answer = result;
      render();
    });
  }

  function render(): void {
    if (store.state.lang !== lang) {
      lang = store.state.lang;
      applyText(page(root), dictionary());
    }
    if (store.state.lang !== loadedLang) load();
    if (
      shown?.lang === store.state.lang &&
      shown.category === category &&
      shown.region === region &&
      shown.answer === answer
    )
      return;
    shown = { lang: store.state.lang, category, region, answer };
    for (const b of root.querySelectorAll<HTMLElement>("[data-cat]"))
      b.classList.toggle("active", b.dataset.cat === category);
    for (const b of root.querySelectorAll<HTMLElement>("[data-region]"))
      b.classList.toggle("active", b.dataset.region === region);
    must<HTMLElement>(root, "[data-regions]").hidden =
      category !== "weather_report";
    must<HTMLElement>(root, "[data-text-title]").textContent = say(
      TITLE[category],
    );

    const product =
      answer === undefined || answer === null
        ? null
        : textProduct(answer, category, region);
    issued.hidden = !product?.issueTime;
    if (product?.issueTime)
      issued.textContent = `${say("forecast.issued")} ${new Date(product.issueTime).toLocaleString(localeFor(store.state.lang))}`;
    const html = product?.html
      ? sanitizeForecastHtml(product.html, browserParse)
      : "";
    card.hidden = html === "";
    status.hidden = html !== "";
    if (html) must<HTMLElement>(root, "[data-text-body]").innerHTML = html;
    else
      status.textContent = say(
        answer === undefined
          ? "forecast.loading"
          : answer === null
            ? "forecast.textUnavailable"
            : EMPTY[category],
      );
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const cat = target.closest<HTMLElement>("[data-cat]")?.dataset.cat;
    const reg = target.closest<HTMLElement>("[data-region]")?.dataset.region;
    if (cat && (TEXT_CATEGORIES as readonly string[]).includes(cat))
      category = cat as TextCategory;
    else if (reg && (REGIONS as readonly string[]).includes(reg))
      region = reg as Region;
    else return;
    history.replaceState(
      history.state,
      "",
      withParams(location.href, {
        cat: category === "weather_report" ? null : category,
        region: region === "0" ? null : region,
      }),
    );
    render();
  });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-forecast-text]");
if (root) mountTextForecast(root);
else console.error("[forecast] The page has no [data-forecast-text] root");

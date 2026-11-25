// The header's and bottom nav's behaviour over their static markup
// (src/components/shell/): the saved language's words, the Foehn pill, and
// the GPS, theme and language controls. The tab links are plain links; the
// only thing a click on one adds is clearing the wind filter when the Map
// tab is clicked on the map, which resets the map.

import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import { handoffUrl } from "../handoff.ts";
import { isOneOf } from "../coerce.ts";
import { applyText } from "../i18n/text.ts";
import { locatePilot } from "../maps/locate.ts";
import { LANGS, type Lang } from "../settings.ts";
import { store } from "../state.ts";
import { foehnPill } from "./foehn-pill.ts";
import { resetsMap } from "./nav.ts";

function isLang(v: unknown): v is Lang {
  return isOneOf(LANGS, v);
}

export function mountShell(header: HTMLElement): void {
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>("[data-shell]"),
  );
  const gps = must<HTMLButtonElement>(header, '[data-action="locate"]');
  const langButton = must<HTMLButtonElement>(header, '[data-action="lang"]');
  const langMenu = must<HTMLElement>(header, "[data-lang-menu]");
  const langLabel = must<HTMLElement>(header, "[data-lang-label]");
  const pill = must<HTMLAnchorElement>(header, "[data-foehn-pill]");

  let lang: Lang | null = null;
  function render(): void {
    if (store.state.lang === lang) return;
    lang = store.state.lang;
    for (const root of roots) applyText(root, store.t);
    langLabel.textContent = lang.toUpperCase();
    for (const b of langMenu.querySelectorAll<HTMLElement>("[data-lang]")) {
      const on = b.dataset.lang === lang;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  function setMenu(open: boolean): void {
    langMenu.classList.toggle("hidden", !open);
    langButton.setAttribute("aria-expanded", String(open));
  }

  function locate(): void {
    // off the map, the map asks for the position itself (src/scripts/handoff.ts)
    if (store.state.activeTab !== "map") {
      location.assign(handoffUrl({ locate: true }));
      return;
    }
    // no made-up position on failure: the map stays as it is, with no
    // marker (locatePilot logs why)
    gps.classList.add("spinning");
    void locatePilot().then((at) => {
      gps.classList.remove("spinning");
      if (at) store.setPilotLocation(at);
    });
  }

  gps.addEventListener("click", locate);
  must(header, '[data-action="theme"]').addEventListener("click", () =>
    store.setTheme(store.state.theme === "dark" ? "light" : "dark"),
  );
  langButton.addEventListener("click", () =>
    setMenu(langMenu.classList.contains("hidden")),
  );
  langMenu.addEventListener("click", (event) => {
    const choice = (event.target as Element).closest<HTMLElement>(
      "[data-lang]",
    );
    if (!choice) return;
    if (isLang(choice.dataset.lang)) store.setLang(choice.dataset.lang);
    else console.error(`[shell] Unknown language ${choice.dataset.lang}`);
    setMenu(false);
  });
  // a click anywhere outside the language dropdown closes it
  document.addEventListener("click", (event) => {
    if (!langButton.parentElement?.contains(event.target as Node))
      setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || langMenu.classList.contains("hidden")) return;
    setMenu(false);
    langButton.focus();
  });
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    'a[data-tab="map"]',
  ))
    link.addEventListener("click", (event) => {
      if (resetsMap(event, store.state.activeTab)) store.clearWindFilter();
    });

  ShvApi.getFoehn()
    .then((report) => {
      const shown = foehnPill(report);
      if (!shown) return;
      pill.classList.add(shown.badge);
      must(pill, "[data-foehn-label]").textContent = shown.label;
      pill.classList.remove("hidden");
    })
    .catch((err: unknown) => {
      console.error("[shell] Cannot load the Foehn pill:", err);
    });

  store.subscribe(render);
  render();
}

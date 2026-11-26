// The safety page's behaviour over its static markup
// (src/components/safety/): words from the dictionaries, the checklist from
// the store (src/scripts/state.ts), and the DABS card's next publication
// and tomorrow's link from the Swiss clock (dabs.ts); every handler
// attached here rather than inline. Re-renders on each store change, which
// is how the header's language switch reaches the page.

import { store } from "../state.ts";
import { must } from "../dom.ts";
import { applyText, fill } from "../i18n/text.ts";
import {
  storeDictionary as dictionary,
  storeSay as say,
} from "../i18n/store.ts";
import { allChecked, isCheckPoint } from "./checklist.ts";
import { nextPublication, tomorrowPublished } from "./dabs.ts";

/** How often the DABS card checks the clock while the page is open. */
const CLOCK_MS = 60_000;

export function mountSafety(root: HTMLElement): void {
  const checkboxes = Array.from(
    root.querySelectorAll<HTMLInputElement>("input[data-check]"),
  );
  const checklistCard = must<HTMLElement>(root, "#checklist");
  const readyBadge = must<HTMLElement>(root, ".check-ready-badge");
  const tomorrowLink = must<HTMLElement>(root, "[data-dabs-tomorrow]");
  const nextText = must<HTMLElement>(root, "[data-dabs-next]");

  let lang: string | null = null;

  // tomorrow's DABS only once it is published (16:00 Swiss time), and the
  // next scheduled publication, from the clock
  function renderDabs(): void {
    const now = Date.now();
    tomorrowLink.hidden = !tomorrowPublished(now);
    const next = nextPublication(now);
    nextText.textContent = fill(
      say(
        next.nextDay
          ? "safety.dabsNextFirst"
          : next.tomorrow
            ? "safety.dabsNextTomorrow"
            : "safety.dabsNext",
      ),
      { time: next.time },
    );
  }

  function render(): void {
    const checklist: Record<string, boolean> = store.state.checklist;
    if (store.state.lang !== lang) {
      lang = store.state.lang;
      applyText(root, dictionary());
    }
    for (const box of checkboxes) {
      box.checked = checklist[box.dataset.check ?? ""] === true;
      box.closest(".check-item")?.classList.toggle("done", box.checked);
    }
    const ready = allChecked(checklist);
    checklistCard.classList.toggle("all-complete", ready);
    readyBadge.hidden = !ready;
    renderDabs();
  }

  const actions: Record<string, () => void> = {
    "check-all": () => store.checkAllChecklist(),
    "reset-checklist": () => store.resetChecklist(),
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action && actions[action]) actions[action]();
  });
  root.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement;
    const point = box.dataset?.check;
    if (isCheckPoint(point)) store.setChecklistPoint(point, box.checked);
  });
  document.addEventListener("visibilitychange", renderDabs);
  window.setInterval(renderDabs, CLOCK_MS);

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-safety]");
if (root) mountSafety(root);
else console.error("[safety] The page has no [data-safety] root");

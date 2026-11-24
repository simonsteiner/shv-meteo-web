// The safety page's behaviour over its static markup
// (src/components/safety/): words from the dictionaries, the checklist,
// vario and logbook from the store (src/scripts/state.ts), every handler
// attached here rather than inline. Re-renders on each store change, which
// is how the header's language switch reaches the page.

import { store } from "../state.ts";
import { ShvApi } from "../api.ts";
import { must } from "../dom.ts";
import { applyText } from "../i18n/text.ts";
import {
  storeDictionary as dictionary,
  storeSay as say,
} from "../i18n/store.ts";
import { VarioAudio } from "./audio.ts";
import { flightCardsHtml } from "./cards.ts";
import { allChecked, isCheckPoint } from "./checklist.ts";
import { csvFileName, flightsCsv } from "./csv.ts";
import {
  flightFromForm,
  flightStats,
  formatAirtime,
  localDate,
  readFlights,
  type Flight,
} from "./flights.ts";
import { formatRate, gaugeState } from "./vario.ts";

export function mountSafety(root: HTMLElement): void {
  const audio = new VarioAudio();
  const checkboxes = Array.from(
    root.querySelectorAll<HTMLInputElement>("input[data-check]"),
  );
  const checklistCard = must<HTMLElement>(root, "#checklist");
  const readyBadge = must<HTMLElement>(root, ".check-ready-badge");
  const varioButton = must<HTMLButtonElement>(
    root,
    '[data-action="toggle-vario"]',
  );
  const varioLabel = must<HTMLElement>(root, "[data-vario-label]");
  const gauge = must<HTMLElement>(root, "[data-vario-gauge]");
  const rateText = must<HTMLElement>(root, "[data-vario-rate]");
  const slider = must<HTMLInputElement>(root, "[data-vario-slider]");
  const flightList = must<HTMLElement>(root, "[data-flights]");
  const emptyLog = must<HTMLElement>(root, "[data-flights-empty]");
  const dialog = must<HTMLElement>(root, "[data-flight-dialog]");
  const form = must<HTMLFormElement>(root, "[data-flight-form]");
  const addButton = must<HTMLButtonElement>(root, '[data-action="add-flight"]');

  let lang: string | null = null;
  // the log only grows (store.addFlight), so its length says when to
  // read it again (and log a bad entry once, not on every render)
  let flights: Flight[] = [];
  let flightsRead = -1;

  function currentFlights(): Flight[] {
    const stored: unknown[] = store.state.flights;
    if (stored.length !== flightsRead) {
      flights = readFlights(stored);
      flightsRead = stored.length;
    }
    return flights;
  }

  function render(): void {
    const { varioRate, varioMuted } = store.state;
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

    varioButton.classList.toggle("active-audio", !varioMuted);
    varioLabel.textContent = say(
      varioMuted ? "safety.varioMute" : "safety.varioUnmute",
    );
    rateText.textContent = formatRate(varioRate);
    const state = gaugeState(varioRate);
    gauge.classList.toggle("vario-lift", state === "lift");
    gauge.classList.toggle("vario-sink", state === "sink");
    if (Number(slider.value) !== varioRate) slider.value = String(varioRate);

    const list = currentFlights();
    const stats = flightStats(list);
    must<HTMLElement>(root, '[data-stat="count"]').textContent = String(
      stats.count,
    );
    must<HTMLElement>(root, '[data-stat="airtime"]').textContent =
      formatAirtime(stats.totalMinutes);
    must<HTMLElement>(root, '[data-stat="longest"]').textContent =
      `${stats.longestMinutes} min`;
    emptyLog.hidden = list.length > 0;
    flightList.innerHTML = flightCardsHtml(list);
  }

  function toggleVario(): void {
    if (store.state.varioMuted) {
      if (audio.start(store.state.varioRate)) store.setVarioMuted(false);
    } else {
      audio.stop();
      store.setVarioMuted(true);
    }
  }

  function openDialog(): void {
    form.reset();
    must<HTMLInputElement>(form, '[name="date"]').value = localDate(new Date());
    // the glider of the latest flight, since most pilots fly one wing
    must<HTMLInputElement>(form, '[name="glider"]').value =
      currentFlights()[0]?.glider ?? "";
    dialog.hidden = false;
    must<HTMLInputElement>(form, '[name="duration"]').focus();
  }

  function closeDialog(): void {
    if (dialog.hidden) return;
    dialog.hidden = true;
    addButton.focus();
  }

  function saveFlight(): void {
    const data = new FormData(form);
    const field = (name: string) => {
      const v = data.get(name);
      return typeof v === "string" ? v : null;
    };
    const flight = flightFromForm(field, `f-${Date.now()}`);
    if (!flight) {
      console.error("[safety] The flight form holds an invalid entry");
      form.reportValidity();
      return;
    }
    closeDialog();
    store.addFlight(flight);
  }

  function exportCsv(): void {
    const csv = flightsCsv(currentFlights(), {
      date: say("safety.date"),
      site: say("safety.site"),
      landing: say("safety.landing"),
      duration: say("safety.duration"),
      glider: say("safety.glider"),
      distance: say("safety.distance"),
      notes: say("safety.notes"),
    });
    // the byte order mark tells spreadsheet apps the file is UTF-8
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName(localDate(new Date()));
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const actions: Record<string, () => void> = {
    "check-all": () => store.checkAllChecklist(),
    "reset-checklist": () => store.resetChecklist(),
    "toggle-vario": toggleVario,
    "add-flight": openDialog,
    "close-dialog": closeDialog,
    "export-csv": exportCsv,
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target === dialog) return closeDialog();
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action && actions[action]) actions[action]();
  });
  root.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement;
    const point = box.dataset?.check;
    if (isCheckPoint(point)) store.setChecklistPoint(point, box.checked);
  });
  slider.addEventListener("input", () => {
    store.setVarioRate(Number(slider.value));
    audio.setRate(store.state.varioRate);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveFlight();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDialog();
  });
  window.addEventListener("pagehide", () => audio.stop());

  ShvApi.getDabs()
    .then((dabs) => {
      must<HTMLElement>(root, "[data-dabs-validity]").textContent =
        dabs.validity;
    })
    .catch((err: unknown) => {
      console.error("[safety] Cannot build the DABS card:", err);
    });

  store.subscribe(render);
  render();
}

const root = document.querySelector<HTMLElement>("[data-safety]");
if (root) mountSafety(root);
else console.error("[safety] The page has no [data-safety] root");

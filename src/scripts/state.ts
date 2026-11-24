// The page's one store (src/scripts/app-state.ts) over the browser's
// storage. Every page script imports it, and they share it: a module runs
// once per page. The document's theme and language follow it, set before
// any page script's listener runs, so a listener reads the new theme's
// colours.

import { AppState, type State } from "./app-state.ts";
import { browserStorage, purgeLegacyAuth } from "./settings.ts";

export type { State, Tab } from "./app-state.ts";

// Storages that never throw, even where the browser blocks them.
const local = browserStorage("localStorage");
purgeLegacyAuth(local);

export const store = new AppState({
  local,
  session: browserStorage("sessionStorage"),
  view: document.body.dataset.view,
  navigate: (path) => location.assign(path),
});

function applyDocument(state: State): void {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== state.theme)
    root.setAttribute("data-theme", state.theme);
  if (root.lang !== state.lang) root.lang = state.lang;
}

store.subscribe(applyDocument);
applyDocument(store.state);

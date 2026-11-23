import { store } from "./state.js";
import { renderHeader } from "./components/Header.js";
import { renderBottomNav } from "./components/BottomNav.js";
import { renderBottomSheet } from "./components/BottomSheet.js";
import { MapView } from "./views/MapView.js";
import { WeatherView } from "./views/WeatherView.js";
import { ForecastView } from "./views/ForecastView.js";
import { ShvApi } from "./scripts/api.ts";

export const storeInstance = store;
if (typeof window !== "undefined") {
  window.appStore = store;
}

// Global error monitoring to prevent any errors from being swallowed
window.addEventListener("error", (event) => {
  console.error("[Global Error]", event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled Promise Rejection]", event.reason);
});

class App {
  constructor() {
    this.headerContainer = document.getElementById("header-container");
    this.viewContainer = document.getElementById("view-container");
    this.bottomSheetContainer = document.getElementById(
      "bottom-sheet-container",
    );
    this.bottomNavContainer = document.getElementById("bottom-nav-container");

    this.currentViewInstance = null;
    this.lang = null;
    this.theme = null;
  }

  async init() {
    // 1. Render UI immediately so app is instantly interactive. The page
    // names its view (<body data-view>, src/layouts/Base.astro); a ported
    // page brings its view in the markup and mounts it itself.
    this.renderShell();
    this.mountView(store.state.activeTab);

    // 2. Fetch background Foehn data for header pill asynchronously
    ShvApi.getFoehn()
      .then((foehnData) => {
        if (foehnData) {
          store.state.foehn = foehnData;
          renderHeader(this.headerContainer);
        }
      })
      .catch((e) => {
        console.error("[App.init] Failed to fetch background foehn data:", e);
      });

    // 3. Subscribe to state updates. The tab never changes within a page:
    // switching tabs navigates (store.setTab).
    store.subscribe((state) => {
      // Re-render shell if language or theme changed
      if (state.lang !== this.lang || state.theme !== this.theme) {
        this.renderShell();
      }

      // Re-render bottom sheet
      renderBottomSheet(this.bottomSheetContainer);
    });
  }

  renderShell() {
    this.lang = store.state.lang;
    this.theme = store.state.theme;

    // Apply document theme
    document.documentElement.setAttribute("data-theme", this.theme);
    document.documentElement.setAttribute("lang", this.lang);

    renderHeader(this.headerContainer);
    renderBottomNav(this.bottomNavContainer);
    renderBottomSheet(this.bottomSheetContainer);
  }

  mountView(tab) {
    try {
      switch (tab) {
        case "map":
          this.currentViewInstance = new MapView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case "weather":
          this.currentViewInstance = new WeatherView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case "forecast":
          this.currentViewInstance = new ForecastView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
        case "safety":
          // A ported page: its markup is built in and its own script
          // drives it (src/pages/safety/index.astro).
          break;
        default:
          this.currentViewInstance = new MapView(this.viewContainer);
          this.currentViewInstance.mount();
          break;
      }
    } catch (err) {
      console.error(`[App.mountView] Error mounting view "${tab}":`, err);
    }
  }
}

// A page restored from the back/forward cache holds the settings it had
// when left, and its setters would write them back over what another page
// saved since; reload it from storage instead.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});

// Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});

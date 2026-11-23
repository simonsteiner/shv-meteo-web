# Web architecture

The web version reproduces the native mobile application in the browser: static Astro pages, one per tab, wrapping vanilla JavaScript views:

- **Pages** (`src/pages/<tab>/index.astro`, built by Astro): each wraps [src/layouts/Base.astro](../../src/layouts/Base.astro) (head, the four mount points, the inline theme script) and sets `<body data-view>`. [src/main.js](../../src/main.js) mounts the header, bottom nav, bottom sheet and the view `data-view` names, and installs global `error` and `unhandledrejection` loggers. `store.setTab` in [src/state.js](../../src/state.js) navigates to `/<tab>/`; selections handed to the map travel in its URL ([src/scripts/handoff.ts](../../src/scripts/handoff.ts)). `store` persists language, theme, map settings, vario rate and logbook to `localStorage` (`shv_*` keys, [src/scripts/settings.ts](../../src/scripts/settings.ts)), the checklist to `sessionStorage`, and the session id and profile to `localStorage`.
- **Views** ([src/views/](../../src/views/)): `MapView` (Leaflet map, layers, obstacles), `WeatherView` (Föhn, stations, webcams), `ForecastView` (text forecasts, outlooks, soundings, isobar charts), `SafetyView` (DABS, checklist, logbook, variometer), `ProfileView` (SHV login and digital licence).
- **Data client**: [src/services/api.js](../../src/services/api.js) (`ShvApi`) is the only module that calls `fetch`; it caches the GIS datasets in memory.
- **Translations**: [src/i18n/](../../src/i18n/) holds `de`, `fr`, `it` and `en`, read through `store.t`. Many view strings are still hardcoded German.
- **API** ([functions/api/](../../functions/api/), Cloudflare Pages Functions): the `/api/*` routes in [data-queries.md](data-queries.md), one-line adapters over [src/scripts/upstream/](../../src/scripts/upstream/). Shared shapes, and the Functions' `Context` type, are in [src/scripts/types.ts](../../src/scripts/types.ts).
- **Dev launcher**: [scripts/dev.ts](../../scripts/dev.ts) runs `wrangler pages dev public` on `8788`, which compiles `functions/` without a build, and `astro dev` on `4321`, which proxies `/api` to it ([astro.config.mjs](../../astro.config.mjs)).

## Member login

The copy-paste PKCE login against SHV Keycloak lived in Express (`server/auth.js`) and went with `server/` in PR9; its routes are 404 now, and PR13 removes `ProfileView` and the client methods. How the official app's login works is in [reference/shv-native-app.md](../reference/shv-native-app.md); the design to use if login returns is in the [migration plan](../plan/2026-11-23-astro-cloudflare/target.md#auth-deferred).

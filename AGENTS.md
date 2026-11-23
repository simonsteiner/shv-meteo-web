# Swiss Free Flight

A web app for Swiss paraglider and hang glider pilots that shows flying sites, airspace hazards, live weather and soaring forecasts from the public data behind the official SHV FSVL app. It is a static Astro site (`src/pages/`, one page per tab) wrapping the legacy vanilla JavaScript views (`src/views/`), plus an Express API (`server/`) that runs only in local development until Pages Functions replace it. The browser loads static GIS data from `public/data/` and calls everything else through `/api/*`, which proxies, caches and processes the upstream services (Ubique weather and webcams, SHV, MeteoSwiss ICON, BAZL obstacles, SHV Keycloak).

Domain terms are in `GLOSSARY.md`. The move to Astro on Cloudflare Pages is in progress (`docs/plan/2026-11-23-astro-cloudflare/`); this file describes the code as it is now.

## Commands

```bash
npm install  # install dependencies (Node 24)
npm run dev  # API on 3001 and astro dev on 4321 (proxies /api), open http://localhost:4321/map/
npm run server  # Express API only, port 3001
npm run build  # astro build into dist/
npm run preview  # wrangler pages dev dist on 8788, as Pages serves it (no /api until PR9)
npm run typecheck  # astro check, also the pre-push hook
npm test  # node --test over src/scripts/**/*.test.ts
npm run lint  # oxlint and prettier --check, as in the pre-commit hook
npm run format  # prettier --write
node scripts/generate_screenshots.js  # capture all views, see docs/setup.md first
```

## Conventions

### Data access

- **`ShvApi` is the only caller of `fetch` in the browser.** Add new endpoints to `src/services/api.js`; views and components never fetch directly.
- **Proxy only what has to be proxied.** The browser calls an upstream directly only when it allows CORS and the payload is light; anything with CORS limits, heavy data, multi-station math or auth gets an `/api` route in `server/index.js`. The reasoning and the current split are in `docs/architecture.md`.
- **Upstream weather units are quirky.** Wind and gusts already arrive in km/h (never multiply by 3.6), a temperature above 200 is Kelvin, a pressure above 5000 is in tenths of hPa. The conversion is duplicated in `src/components/BottomSheet.js`, `src/views/WeatherView.js`, `src/views/MapView.js` (temperature only) and `server/index.js`; change all four together.
- **Server caches are in memory and serve stale data on upstream errors.** Follow the pattern of the existing routes in `server/index.js` (timeout via `AbortController`, TTL cache, last good response as fallback, 503 with a German error message).

### UI and state

- **App state lives in `store` (`src/state.js`).** Values persisted to `localStorage` use `shv_*` keys.
- **UI strings come from `src/i18n/{de,fr,it,en}.js` through `store.t`.** Add every new key to all four files; German is the default language.
- **Flying-site features are not all points.** Many are `Polygon`, `MultiPolygon` or `LineString`; get a position through the centroid helpers (`getFeatureLatLng()` in `src/views/MapView.js`, `getSiteCenterLatLng()` in `src/components/BottomSheet.js`), never by indexing `geometry.coordinates`.
- **Use the glossary's terms** in code, UI and docs (take-off, not launch site; station pair, not transect).

### Errors

- **Never swallow an error.** Log it with `console.error` and a `[Module]` prefix (for example `[Server]`, `[AppState.method]`); `src/main.js` also logs every uncaught error and rejection.

## Hard constraints

- **Never add mock, sample or synthesized data.** No fake profiles, placeholder ratings, simulated measurements or generated trend curves; show an empty or error state when real data is missing.
- **Never accept or store SHV passwords.** Login happens only on the SHV Keycloak page through the PKCE copy-paste flow in `server/auth.js`.
- **Never send tokens to the browser.** Access and refresh tokens stay in the server session; the browser gets the session id (`x-session-id` header), the claims and the profile, never a token.
- **Never bypass the git hooks** (`--no-verify`, `LEFTHOOK=0`). lefthook (`lefthook.yml`, installed by `npm install`) blocks staged files over 5,000 tokens and any em or en dash. Split an oversized file along its seams; write a dash a user must see as a JavaScript unicode escape, as the views already do.

## Gotchas

- **The code was written by LLMs without human review.** Treat comments and doc claims as hints and check them against the code.
- **Only new code is tested and type-checked.** `astro check` covers `.ts` and `.astro` files; the legacy `.js` is not checked (`checkJs` is off) and has no tests, and there is no CI yet. Check a change with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and by using it in the browser on `npm run dev`.
- **Every tab is its own page.** `src/pages/<tab>/index.astro` sets `<body data-view>` through `src/layouts/Base.astro`, and `src/main.js` mounts that view; `store.setTab` navigates. A selection handed to the map travels in its URL (`src/scripts/handoff.ts`), and settings that must outlive a page load persist through `src/scripts/settings.ts`.
- **Browser code stays at ES2020.** `astro.config.mjs` keeps the old build target (Safari 14, Chrome 87, Firefox 78) on purpose; syntax is lowered but builtins are not polyfilled, so don't use newer ones (`Object.hasOwn`, `Array.prototype.at`, `structuredClone`) in browser code.
- **Sessions and pending logins live in memory** in `server/auth.js`, so a server restart drops them. The UI doesn't notice: it keeps showing the profile cached in `localStorage` (`shv_profile`) and only asks the server when that cache is empty.
- **`previtemps_stations.json` exists three times** (`server/data/`, `public/data/`, `src/data/`); the server reads `server/data/` and `src/data/` is unused. Keep the copies identical.
- **The Python script is effectively unused.** `server/emagram_calc.py` backs only `/api/emagram/calculate` and `/api/meteo/previtemps/sounding*`, which no view calls; the emagram the UI shows comes from `server/emagram_provider.js`. `ShvApi.getEmagramSounding` calls a route that does not exist.
- **`public/data/*.geojson` are snapshots of the upstream CDN datasets.** `ShvApi` loads them first and falls back to the CDN URLs in `src/services/api.js`.
- **The first `/api/obstacles` call is slow.** It downloads and indexes the full BAZL dataset (about 122 MB) and keeps it in memory until the process restarts; see `docs/setup.md` for the disk cache.

## Docs

- `README.md`: what the app does, screenshots, quickstart.
- `docs/setup.md`: local setup, screenshots tool, Chrome DevTools MCP, troubleshooting.
- `docs/deployment.md`: Cloudflare Pages, deploying by hand, rollback, state and secrets.
- `docs/architecture.md`: data sources, which calls are proxied and why, every `/api` route, how the code is organised. Read before adding or changing an endpoint.
- `docs/reference/shv-native-app.md`: reverse-engineered notes on the official app, Keycloak and the member web service. Read before touching auth or member data.
- `GLOSSARY.md`: domain terms in English and German.
- `docs/plan/2026-11-23-astro-cloudflare/`: the migration plan and PR stack. Read before starting a migration PR.

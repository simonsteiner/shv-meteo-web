# Swiss Free Flight

A web app for Swiss paraglider and hang glider pilots that shows flying sites, airspace hazards, live weather and soaring forecasts from the public data behind the official SHV FSVL app. It is a static Astro site (`src/pages/`, one page per tab, each with its components in `src/components/<tab>/` and its TypeScript in `src/scripts/`; the header and bottom nav in `src/components/shell/`), plus Cloudflare Pages Functions (`functions/api/`) for the upstream calls a browser can't make. The browser loads static GIS data from `public/data/`, a few upstreams directly, and everything else through `/api/*`, where the Functions proxy and cache the upstream services (Ubique weather and webcams, SHV, MeteoSwiss ICON).

Domain terms are in `GLOSSARY.md`. The move to Astro on Cloudflare Pages is in progress (`docs/plan/2026-11-23-astro-cloudflare/`); this file describes the code as it is now.

## Commands

```bash
npm install  # install dependencies (Node 24)
npm run dev  # wrangler pages dev (Functions) on 8788 and astro dev on 4321 (proxies /api), open http://localhost:4321/map/
npm run build  # astro build into dist/
npm run preview  # wrangler pages dev dist on 8788: the built pages and the Functions, as Pages serves them
npm run typecheck  # astro check, also the pre-push hook
npm test  # node --test over src/scripts/**/*.test.ts
npm run lint  # oxlint and prettier --check, as in the pre-commit hook
npm run format  # prettier --write
npm run grid  # rewrite src/data/previtemps_grid.json from the station catalogue (needs network)
npm run obstacles  # build the BAZL obstacle shards into public/data/obstacles/ (needs network)
npm run shot -- http://localhost:4321/map/ /tmp/map.png  # PNG of a page on a running dev server; see docs/setup.md
```

## Conventions

### Data access

- **`ShvApi` is the only caller of `fetch` in the browser.** Add new endpoints to `src/scripts/api.ts`; views and components never fetch directly.
- **Proxy only what has to be proxied.** The browser calls an upstream directly only when it allows CORS and the payload is light; anything with CORS limits (or a 403 to an `Origin` header), heavy data or multi-station math gets a Pages Function in `functions/api/`. The reasoning and the current split are in `docs/architecture/data-queries.md`.
- **Upstream weather units are quirky.** Wind and gusts already arrive in km/h (never multiply by 3.6), a temperature above 200 is Kelvin, a pressure above 5000 is in tenths of hPa. Convert through `src/scripts/units.ts` (`toCelsius`, `toHpa`).
- **A Function is a one-line adapter.** Add a route to `ROUTES` in `src/scripts/upstream/routes.ts` (fixed upstream URL, TTL, timeout, German error body) and its checks to `params.ts`, then call `proxy(name, ctx)` from `functions/api/`. `respond.ts` streams the body unparsed, sets `Cache-Control`, keeps each 200 in the edge cache as the fallback for an upstream error (served only if it still looks like JSON: parsed in full up to about 200 KB, above that only its outer brackets checked), and answers anything else with a 503 that is never cached. Functions keep no memory between requests.

### UI and state

- **App state lives in `store` (`src/scripts/state.ts`, over the `AppState` class in `app-state.ts`).** Values persisted to `localStorage` use `shv_*` keys through `src/scripts/settings.ts`.
- **UI strings come from `src/scripts/i18n/{de,fr,it,en}.ts` (the map's in `i18n/map/`) through `store.t`.** Add every new key to all four files; German is the default language, the others are typed as its shape and `dictionaries.test.ts` checks the keys match. Markup names its string with `data-t` and the page script fills it with `applyText` (`src/scripts/i18n/text.ts`).
- **Flying-site features are not all points.** Many are `Polygon`, `MultiPolygon` or `LineString`; get a position through `featureLatLng()` in `src/scripts/maps/centroid.ts`, never by indexing `geometry.coordinates`.
- **Use the glossary's terms** in code, UI and docs (take-off, not launch site; station pair, not transect).

### Errors

- **Never swallow an error.** Log it with `console.error` and a `[Module]` prefix (for example `[respond]`, `[AppState.method]`); the shell script (`src/scripts/shell/errors.ts`) also logs every uncaught error and rejection.

## Hard constraints

- **Never add mock, sample or synthesized data.** No fake profiles, placeholder ratings, simulated measurements or generated trend curves; show an empty or error state when real data is missing.
- **Never accept or store SHV passwords, and never send tokens to the browser.** The site has no member login (it reused the official app's Keycloak client; the header links to the SHV member portal instead). If login returns, it follows the cookie design in the migration plan (`target.md`, "Auth"); how to check membership, and what to ask the SHV for, is in `docs/research/2026-11-24-member-check.md`.
- **Never bypass the git hooks** (`--no-verify`, `LEFTHOOK=0`). lefthook (`lefthook.yml`, installed by `npm install`) blocks staged files over 5,000 tokens and any em or en dash. Split an oversized file along its seams; write a dash a user must see as a JavaScript unicode escape, as the views already do.

## Gotchas

- **The code was written by LLMs without human review.** Treat comments and doc claims as hints and check them against the code.
- **Everything under `src/` is TypeScript or `.astro`.** `astro check` covers both; keep new browser code there, never in `.js`. CI (`.github/workflows/ci.yml`) runs lint, rumdl, tests, typecheck and build on every push and pull request, and `deploy.yml` deploys `main` to Cloudflare Pages once it passes. Check a change with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and by using it in the browser on `npm run dev`.
- **Every tab is its own page.** `src/pages/<tab>/index.astro` sets `<body data-view>` through `src/layouts/Base.astro`, which renders the header and bottom nav with real `<a href>` tab links (the current one marked `aria-current="page"` at build time) and loads the shell script (`src/scripts/shell/shell.ts`: the error loggers, the back/forward cache reload, the header's controls) before the page's own script; `store.setTab` navigates. A selection handed to the map travels in its URL (`src/scripts/handoff.ts`: `?site`, `?station`, `?webcam`, `?locate`, each with an optional `&z=<zoom>`), and settings that must outlive a page load persist through `src/scripts/settings.ts`.
- **No inline scripts or handlers.** Each built page carries a meta CSP (`src/scripts/access/csp.ts`, run at `astro:build:done`) whose `script-src` is `'self'` plus the hash of each inline script the page ships; the only one is the theme script in `Base.astro`. Attach handlers with `addEventListener`; an `onclick=` or `onerror=` attribute won't run. Images and fetches may come from any `https:` origin. `npm run dev` has no CSP, so check a change that loads something new on `npm run build && npm run preview`.
- **Browser code stays at ES2020.** `astro.config.mjs` keeps the old build target (Safari 14, Chrome 87, Firefox 78) on purpose; syntax is lowered but builtins are not polyfilled, so don't use newer ones (`Object.hasOwn`, `Array.prototype.at`, `structuredClone`) in browser code.
- **The sounding Function reads a generated grid.** `src/data/previtemps_grid.json` maps each station of `public/data/previtemps_stations.json` to its ICON grid point; rerun `npm run grid` after changing the catalogue, or when a station's sounding answers 503 for a day.
- **No member data in the browser.** `purgeLegacyAuth` (`src/scripts/settings.ts`) clears the old `shv_session_id` and `shv_profile` keys on every page load.
- **The BAZL obstacles are build-time shards.** `npm run obstacles` downloads the dataset (about 128 MB) and writes `public/data/obstacles/` (git-ignored, about 250 MB); `deploy.yml` runs it before each deploy and daily. Without it locally the obstacle layer stays empty.
- **`public/data/*.geojson` are snapshots of the upstream CDN datasets.** `ShvApi` loads them first and falls back to the CDN URLs in `src/scripts/api.ts`.

## Docs

- `README.md`: what the app does, screenshots, quickstart.
- `docs/setup.md`: local setup, screenshots tool, Chrome DevTools MCP, troubleshooting.
- `docs/deployment.md`: Cloudflare Pages, deploying by hand, rollback, state and secrets.
- `docs/architecture.md`: index of `docs/architecture/`: data sources, which calls go through a Function and why, every `/api` route, how the code is organised. Read `data-queries.md` before adding or changing an endpoint.
- `docs/research/`: dated research notes with the measurements behind a decision (upstream sources, CPU on Pages, the official app's calls, the obstacle tiles).
- `docs/reference/shv-native-app.md`: reverse-engineered notes on the official app, Keycloak and the member web service. Read before bringing back login or member data.
- `docs/reference/shv-app-emulator.md`: installing the official app from a phone onto an Android emulator and driving it with `adb`, from WSL too.
- `docs/reference/shv-app-traffic-capture.md`: capturing the official app's HTTPS calls on the emulator with mitmproxy, redacted when logged in; the calls it found are in `docs/research/2026-11-24-shv-app-network-calls.md`.
- `GLOSSARY.md`: domain terms in English and German.
- `docs/plan/2026-11-23-astro-cloudflare/`: the migration plan and PR stack. Read before starting a migration PR.
- `docs/plan/2026-11-24-follow-ups/`: what is left after the view refactors (the app shell, CSP, deferred review findings), in order.

# Swiss Free Flight

A web app for Swiss paraglider and hang glider pilots that shows flying sites, airspace hazards, live weather and soaring forecasts from the public data behind the official SHV FSVL app. It is a static Astro site (`src/pages/`, one page per tab, each with its components in `src/components/<tab>/` and its TypeScript in `src/scripts/`; the header and bottom nav in `src/components/shell/`), plus Cloudflare Pages Functions (`functions/api/`) for the upstream calls a browser can't make. The browser loads the flying sites, airspaces and wildlife reserves live from the SHV CDN, the sounding stations and obstacle shards from `public/data/`, a few other upstreams directly, and everything else through `/api/*`, where the Functions proxy and cache the upstream services (Ubique weather and webcams, SHV, MeteoSwiss ICON).

Domain terms are in `GLOSSARY.md`. Open work is planned in `docs/plan/`.

## Commands

```bash
npm install  # install dependencies (Node 24) and the lefthook hooks
npm run dev  # wrangler pages dev (Functions) on 8788 and astro dev on 4321 (proxies /api), open http://localhost:4321/map/
npm run build  # astro build into dist/
npm run preview  # wrangler pages dev dist on 8788: the built pages and the Functions, as Pages serves them
npm run typecheck  # astro check, also the pre-push hook
npm test  # node --test over src/scripts/**/*.test.ts
npm run e2e  # Playwright over the built site (e2e/), after npm run build; npx playwright install chromium once
node --experimental-strip-types --test src/scripts/units.test.ts  # run one test file
npm run lint  # oxlint and prettier --check, as in the pre-commit hook
npx rumdl check .  # Markdown lint, as CI runs it; pass file paths to lint only those
npm run format  # prettier --write
npm run grid  # rewrite src/data/previtemps_grid.json from the station catalogue (needs network)
npm run obstacles  # build the BAZL obstacle shards into public/data/obstacles/ (needs network)
npm run shot -- http://localhost:4321/map/ /tmp/map.png  # PNG of a page on a running dev server; see docs/setup.md
```

## Conventions

### Data access

- **`ShvApi` is the only caller of `fetch` in the browser.** Every endpoint the browser reads, direct or through `/api`, gets a method in `src/scripts/api.ts`; views and components never fetch directly.
- **A `ShvApi` read never rejects.** It resolves to its typed value, or to null (an empty list for the station catalogue) after logging `[ShvApi.<method>]`; callers handle null and never `.catch` the read itself (a `.catch` after `.then` still catches a throw while drawing).
- **Proxy only what has to be proxied.** The browser calls an upstream directly only when it allows CORS and the payload is light; anything with CORS limits (or a 403 to an `Origin` header), heavy data or multi-station math gets a Pages Function. Read `docs/architecture/data-queries.md` before adding or changing an endpoint.
- **Upstream weather units are quirky.** Wind and gusts already arrive in km/h (never multiply by 3.6), a temperature above 200 is Kelvin, a pressure above 20,000 is in pascals (Holfuy's and Mistral's `pressureSurfaceValue`) and one outside 300 to 1100 hPa is missing. Convert through `src/scripts/units.ts` (`toCelsius`, `toHpa`).

### Functions

- **A Function is a one-line adapter over `src/scripts/upstream/`.** A proxied endpoint is three pieces: its route in `ROUTES` (`src/scripts/upstream/routes.ts`: upstream URL, TTL, timeout, German error body, and its own `parse` of the path and query, 400 or 404 included, with the shared helpers in `params.ts`), the file under `functions/api/`, and the `ShvApi` method.
- **The Function file calls `proxy`, `serve`, or a route helper that calls `serve`.** `proxy(name, ctx)` passes upstream's body through (`functions/api/webcams.ts`); `serve(name, ctx, compute)` answers what `compute(params, timeoutMs)` builds, which lives with its concern under `src/scripts/` (`functions/api/foehn.ts` over `src/scripts/foehn/fetch.ts`); a Function whose tests need to inject `fetch` calls a helper there that wraps `serve` (the sounding's `soundingRoute` in `src/scripts/emagram/fetch.ts`; the generated grid is imported by `emagram/grid.ts`, which the route's `parse` reads for its 404). Logic never goes in `functions/`, so every test is under `src/scripts/`.
- **`respond.ts` owns caching and errors.** It streams the body unparsed (a `checked` route's fresh body is read and checked as JSON first, so an empty or cut-off 200 counts as a failure), sets `Cache-Control`, keeps each 200 in the edge cache as the fallback for an upstream error (served only while it is younger than the route's `maxStaleSeconds` and still looks like JSON, with its `x-fetched-at`), and answers anything else with a 503 that is never cached.
- **Functions keep no memory between requests.** The edge cache (`caches.default`) is the only state.

### UI and state

- **App state lives in `store` (`src/scripts/state.ts`, over the `AppState` class in `app-state.ts`).** Values persisted to `localStorage` use `shv_*` keys through `src/scripts/settings.ts`; `store.setTab` navigates.
- **A selection handed to the map travels in its URL.** Build and read it with `src/scripts/handoff.ts` (`?site`, `?station`, `?webcam`, `?locate`, each with an optional `&z=<zoom>`).
- **UI strings come from `src/scripts/i18n/{de,fr,it,en}.ts` (the map's in `i18n/map/`) through `store.t`.** Add every new key to all four files; German is the default and the others are typed as its shape. Markup names its string with `data-t` and the page script fills it with `applyText` (`src/scripts/i18n/text.ts`).
- **Every time shown is Swiss time.** Format it through `src/scripts/swiss-time.ts` (`swissTime`, `formatSwiss`, `naiveSwiss` for upstream's offset-less times), never `toLocale*String` or `getHours`, so a device abroad shows the same hours (`swissHour` gives the hour).
- **Escape everything you put in an HTML string.** Stored and upstream values go through `escapeHtml` and URLs through `safeUrl` (`src/scripts/escape.ts`); upstream's forecast HTML goes through `sanitizeForecastHtml` (`src/scripts/forecast/sanitize.ts`).
- **Keep page scripts thin.** A tab's `page.ts` attaches the handlers; the logic goes in pure modules with a `*.test.ts` beside them (`src/scripts/safety/`).
- **Flying-site features are not all points.** Many are `Polygon`, `MultiPolygon` or `LineString`; get a position through `featureLatLng()` in `src/scripts/maps/centroid.ts`, never by indexing `geometry.coordinates`.
- **Use the glossary's terms** in code, UI and docs (take-off, not launch site; station pair, not transect).

### Errors

- **Never swallow an error.** Log it with `console.error` and a `[Module]` prefix (for example `[respond]`, `[AppState.method]`); `src/scripts/shell/errors.ts` also logs every uncaught error and rejection.

## Hard constraints

- **Never add mock, sample or synthesized data.** No fake profiles, placeholder ratings, simulated measurements or generated trend curves; show an empty or error state when real data is missing.
- **Never accept or store SHV passwords, and never send tokens to the browser.** The site has no member login, and the header shows no login or member-portal button until it can do something for a logged-in member. If login returns, it follows the member check research in `docs/research/` and the plan item for it in `docs/plan/`.
- **No member data in the browser.** `purgeLegacyAuth` (`src/scripts/settings.ts`) clears the old `shv_session_id` and `shv_profile` keys on every page load.
- **Never bypass the git hooks** (`--no-verify`, `LEFTHOOK=0`). lefthook (`lefthook.yml`) blocks staged files over 5,000 tokens and any em or en dash. Split an oversized file along its seams; write a dash a user must see as a JavaScript unicode escape, as `src/scripts/foehn/pairs.ts` does.

## Gotchas

- **The code was written by LLMs without human review.** Treat comments and doc claims as hints and check them against the code.
- **Everything under `src/` is TypeScript or `.astro`.** `astro check` covers both; keep new browser code there, never in `.js`.
- **CI runs lint, rumdl, tests, typecheck, build and the browser tests on every push and pull request** (`.github/workflows/ci.yml`); `deploy.yml` deploys `main` to Cloudflare Pages once it passes. Check a change with those and by using it in the browser on `npm run dev`.
- **Every tab is its own page.** `src/pages/<tab>/index.astro` sets `<body data-view>` through `src/layouts/Base.astro`, which renders the header and bottom nav as real `<a href>` links and loads the shell script (`src/scripts/shell/shell.ts`) before the page's own.
- **No inline scripts or handlers.** Each built page carries a meta CSP (`src/scripts/access/csp.ts`) whose `script-src` is `'self'` plus the hash of the one inline script, the theme script in `Base.astro`; attach handlers with `addEventListener`. `npm run dev` has no CSP, so check a change that loads something new on `npm run build && npm run preview`.
- **Browser code stays at ES2020.** `astro.config.mjs` keeps the old build target (Safari 14, Chrome 87, Firefox 78); syntax is lowered but builtins are not polyfilled, so don't use newer ones (`Object.hasOwn`, `Array.prototype.at`, `structuredClone`).
- **The sounding Function reads a generated grid.** Rerun `npm run grid` after changing `public/data/previtemps_stations.json`, or when a station's sounding answers 503 for a day.
- **The BAZL obstacles are build-time shards.** `npm run obstacles` writes `public/data/obstacles/` (git-ignored, about 275 MB); without it locally the obstacle layer stays empty.
- **Flying sites, airspaces and wildlife reserves come live from the SHV CDN** (`GIS_URLS` in `src/scripts/api.ts`), with no copy in `public/data/`: a copy goes stale (closures, new airspaces). Every site sheet links the official map (`airspace.shv-fsvl.ch/map`) for the current status; don't rebuild its features.

## Docs

- `README.md`: what the app does, screenshots, quickstart.
- `docs/setup.md`: local setup, checks, data scripts, screenshots tool, troubleshooting.
- `docs/deployment.md`: Cloudflare Pages, deploying by hand, rollback, state and secrets.
- `docs/architecture.md`: index of `docs/architecture/`: every upstream and `/api` route, what the data holds, how the code is organised.
- `docs/adr/`: architecture decisions and why; read the one on a topic before proposing to undo it.
- `docs/research/`: dated research notes with the measurements behind a decision; read the one on a topic before reopening it.
- `docs/reference/shv-native-app.md`: reverse-engineered notes on the official app: its hosts, code layout and the Previtemps sounding.
- `docs/reference/shv-native-auth.md`: the official app's Keycloak login and member web service; read before bringing back login or member data.
- `docs/reference/shv-app-emulator.md` and `docs/reference/shv-app-traffic-capture.md`: running the official app on an Android emulator and capturing its HTTPS calls.
- `docs/plan/`: dated plans, one folder each; the newest hold the open work, the shipped ones stay as a record.
- `GLOSSARY.md`: domain terms in English and German.

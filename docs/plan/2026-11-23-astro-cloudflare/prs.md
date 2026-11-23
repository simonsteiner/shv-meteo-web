# PR stack: shell, CI, screenshots, CSS

Every PR keeps these true:

- `npm run lint`, `npm run typecheck` and `npm test` (both from PR5) and `npm run build` pass.
- An excluded oversized file is untouched, edited in place, or split; when split, the same PR removes it from the lefthook `exclude:` list.
- Production deploys are manual until PR6, then every merge to `main` deploys. A bad deploy is rolled back in the Pages dashboard (Deployments, then Rollback on the last good one), then fixed forward.
- "Locally" in an accept line means `npm run build` then `npm run preview` (`wrangler pages dev dist`), which serves the built pages and the Functions as Pages does. There are no automatic preview deploys; PR9's spike uses one manual branch deploy.
- `ShvApi` is the browser's only API client, the class in `src/services/api.js` (`src/scripts/api.ts` from PR14).

## PR5 `feat/astro-shell`: deployable shell, TypeScript, astro check

- Astro 7 static at the root, wrapping the legacy views in place. `src/layouts/Base.astro` holds the four mount points (header, view, bottom sheet, bottom nav) and the head meta (icons, `theme-color`, description, viewport) from `index.html`, imports `main.css` and Leaflet's CSS, sets `<body data-view>` from its `view` prop, and has the inline theme script ([target.md](target.md)). Five `src/pages/<tab>/index.astro` pass their tab and load `main.js`, which mounts the view named by `data-view`. `state.js` sets `activeTab` from `document.body.dataset.view` and gets `setTab` navigation and the persisted settings. The handoff callers (`WeatherView.js:629-630`, `:662-663`, and the GPS button in `Header.js:172-177`, which off the map no longer asks for the position itself) call `location.assign(handoffUrl(...))`; `MapView.js` reads `?station`, `?webcam` and `?locate` on mount. The URL building and parsing is `src/scripts/handoff.ts`, loading and saving settings `src/scripts/settings.ts`.
- Dev: `server/start-dev.js` starts Express :3001 and `astro dev`, which proxies `/api` to Express until PR9. Delete the Docker files (Express's static serving goes with `server/` in PR9); `docs/deployment.md` describes Pages instead; AGENTS.md and README drop Docker and `dev:vite` and get the new commands, and AGENTS.md's "views switch by tab state, not by URL" and "no tests, type checker" gotchas are rewritten.
- TypeScript per [typescript.md](typescript.md); scripts `typecheck` and `test`; `prettier-plugin-astro`; lefthook pre-push `npm run typecheck`; first typed modules `handoff.ts` and `settings.ts`.
- `docs/setup.md` sets the prerequisite to Node 24 (it strips types for the `.ts` tests and scripts).
- `package.json`: add `astro`, `typescript`, `@astrojs/check`, `prettier-plugin-astro`, `wrangler`, `@types/leaflet`, `@types/node`; drop `vite`, `lucide`; rename to `shv-meteo-web`; scripts `dev` (start-dev), `build` (`astro build`), `preview` (`wrangler pages dev dist`), `typecheck`, `test`, `lint`, `format`, `server` (until PR9); drop `dev:vite`.
- **Files.** Create: `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `src/layouts/Base.astro`, `src/pages/{map,weather,forecast,safety,profile}/index.astro`, `public/_redirects`, `src/scripts/{handoff,settings}.ts` and their tests. Change: `package.json`, `package-lock.json`, `src/main.js`, `src/state.js`, `src/views/MapView.js`, `src/views/WeatherView.js`, `src/components/Header.js`, `server/start-dev.js`, `lefthook.yml`, `.gitignore`, `.prettierignore` and `.oxlintrc.json` (add `.astro/` and `.wrangler/`), `.prettierrc.json`, AGENTS.md, README, `docs/setup.md`, `docs/deployment.md`, `docs/architecture.md` (the Vite, `index.html` and static-serving parts). Delete: `index.html`, `vite.config.js`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
- **Tests:** `handoff.ts`: each of the three handoffs round-trips through its URL; unknown or malformed parameters are ignored. `settings.ts`: a missing, unparsable or unknown value falls back to its default per key; `layers` merges over the defaults; the checklist goes to `sessionStorage`.
- **Accept:** all checks pass; `git push` runs `astro check`. Locally (no API yet): `/map/` shows tiles and flying sites, the other pages render, `/` redirects to `/map/`, nav changes the URL and Back works, a light theme shows no dark flash. On `npm run dev` (Express behind it): a station picked on `/weather/` opens selected on `/map/` and the URL loses `?station` afterwards; a denied `?locate` leaves the map at its default view with no pilot marker; layers switched on `/map/` survive a trip to `/weather/`; clicking the active Map tab clears the wind filter; the vario starts muted. After the owner approves, `npx wrangler pages project create shv-meteo --production-branch main` and a first manual deploy to `https://shv-meteo.pages.dev` (API calls 404 until PR9).

## PR6 `ci/workflows`

- `ci.yml`: `npm ci`, lint, test, typecheck, build, `rumdl check .`. `deploy.yml`: the guard, concurrency and token-scoped deploy step described in [conventions.md](conventions.md), with everything its CI row lists (SHA-pinned actions, `contents: read`, `persist-credentials: false`). AGENTS.md's "no tests, type checker or CI" gotcha goes.
- **User step:** repo secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
- **Files.** Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`. Change: AGENTS.md.
- **Accept:** CI green; after merge, deploy publishes the merged commit.

## PR7 `chore/shot-script` (parallel with PR6; PR8 and the view PRs use its shots)

- `scripts/shot.ts` (as described in [conventions.md](conventions.md)) replaces `generate_screenshots.js` (undeclared `puppeteer-core`, hardcoded `ws://127.0.0.1:9222`, needs an open tab). `.agents/mcp_config.json` (the Chrome DevTools MCP server agents use to drive a browser) stays: `docs/setup.md` documents it.
- **Files.** Create: `scripts/shot.ts`. Change: `package.json` (`shot`), AGENTS.md, `docs/setup.md`. Delete: `scripts/generate_screenshots.js`.
- **Accept:** `npm run shot -- http://localhost:4321/map/ /tmp/map.png` writes a PNG; later refactor PRs attach before/after shots.

## PR8 `refactor/split-main-css` (needs PR7; parallel with PR9 to PR13)

- Cut `main.css` (about 23,600 tokens) at its section comments into consecutive files, imported from `Base.astro` in the same order, so every rule keeps its place. Line ranges in today's file, each from the first line of its section's comment banner to the line before the blank line ending it: `tokens` 1-90, `chrome` 92-400, `map-controls` 402-724, `map-layers` 726-1219, `map-markers` 1221-1448, `sheet` 1450-1793, `weather` 1795-2143, `forecast` 2145-2262, `safety` 2264-2603, `profile` 2605-3146, `responsive` 3148-3250, `meteo-extras` 3252-3710, `forecast-text` 3712-3946, `forecast-outlooks` 3948-4592, `forecast-emagram` 4594-end. Each is under 3,000 tokens. Drop `main.css` from `exclude:`.
- **Files.** Create: those 15 files in `src/styles/`. Change: `src/layouts/Base.astro`, `lefthook.yml`. Delete: `src/styles/main.css`.
- **Accept:** the files joined in import order with one blank line between them equal `main.css`; each file passes `prettier --check` on its own; shots of the five pages match.

The API PRs, PR9 to PR14, are in [prs-api.md](prs-api.md).

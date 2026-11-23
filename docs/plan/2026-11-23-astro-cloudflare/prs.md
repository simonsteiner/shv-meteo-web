# PR stack: shell, CI, API

Every PR keeps these true:

- `npm run lint`, `npm run typecheck` and `npm test` (both from PR5) and `npm run build` pass.
- An excluded oversized file is untouched, edited in place, or split; when split, the same PR removes it from the lefthook `exclude:` list.
- Production deploys are manual until PR6, then every merge to `main` deploys.

## PR5 `feat/astro-shell`: deployable shell, TypeScript, astro check

- Astro 7 static at the root, wrapping the legacy views in place. `src/layouts/Base.astro` holds the four mount points from `index.html` and imports `main.css` and Leaflet's CSS. Five `src/pages/<tab>/index.astro` load `main.js`; `main.js` reads `data-view`; `state.js` gets `setTab` navigation and the `sessionStorage` handoff. `public/_redirects`.
- Dev proxy `/api` to Express :3001 (`server/start-dev.js` starts `astro dev`). Delete `Dockerfile`, `docker-compose.yml`, `.dockerignore` and the Express production static serving; `docs/deployment.md` describes Pages instead; AGENTS.md and README drop Docker and `dev:vite` and get the new commands.
- TypeScript per [typescript.md](typescript.md); scripts `typecheck` and `test`; `prettier-plugin-astro`; lefthook pre-push `npm run typecheck`; first typed module `src/scripts/upstream/params.ts` with tests (bbox, station id, lang).
- `package.json`: add `astro`, `typescript`, `@astrojs/check`, `prettier-plugin-astro`, `wrangler`, `@types/leaflet`, `@types/node`; drop `vite`, `lucide`; rename to `shv-meteo-web`. Delete `index.html`, `vite.config.js`.
- **Accept:** all checks pass; `git push` runs `astro check`; `wrangler pages dev dist` serves `/map/` with tiles and flying sites and the other pages render; `/` redirects to `/map/`; nav changes the URL and Back works; `npm run dev` works against Express. After user approval, `npx wrangler pages project create shv-meteo --production-branch main` and a first manual deploy to `https://shv-meteo.pages.dev` (API calls 404 until PR9).

## PR6 `ci/workflows`

- `ci.yml`: `npm ci`, lint, test, typecheck, build, `rumdl check .`. `deploy.yml`: the reference project's guard, concurrency and token-scoped deploy step. SHA-pinned actions (secure-github-actions checklist). AGENTS.md's "no tests, type checker or CI" gotcha goes.
- **User step:** repo secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
- **Accept:** CI green; after merge, deploy publishes the merged commit.

## PR7 `chore/shot-script` (parallel with PR6, PR8)

- `scripts/shot.ts` (CDP headless Chromium, URL and output path, after the reference project's `scripts/shot.ts`) replaces `generate_screenshots.js` (undeclared `puppeteer-core`, hardcoded `ws://127.0.0.1:9222`, needs an open tab). Delete `.agents/mcp_config.json` if unused.
- **Accept:** `npm run shot -- http://localhost:4321/map/ /tmp/map.png` writes a PNG; later refactor PRs attach before/after shots.

## PR8 `refactor/split-main-css` (parallel with PR9 to PR13)

- Split `main.css` mechanically into `src/styles/{tokens,chrome,map,sheet,weather,forecast,safety,profile}.css`, imported in order from `Base.astro`. Drop `main.css` from `exclude:`.
- **Accept:** built CSS differs only in whitespace and order; shots of the five pages match.

## PR9 `feat/functions-proxies`

- Functions for `measurements`, `measurements/timeseries/[id]`, `webcams`, `meteo/text-forecast/[lang]`, `meteo/isobaren/[lang]`, `meteo/outlooks`, over `src/scripts/upstream/{fetch,respond}.ts` (timeout, host allowlist, honest UA, streaming, cache headers, SVG CSP), tested with a fake `fetch`. Create `src/scripts/types.ts`. `ShvApi.getDabs()` builds DABS locally. `scripts/dev.ts` runs `astro dev` with `wrangler pages dev dist`. Spike on `pages.dev` edge caching, recorded in `docs/architecture.md`.
- **Accept:** `/api/webcams` returns webcams; `/api/measurements?minLat=x` returns 400; `/api/meteo/isobaren/de` has the CSP header; `/weather/` and forecast text work on the preview deploy.

## PR10 `feat/functions-foehn`

- `src/scripts/units.ts` (Kelvin and deci-hPa heuristics, tested); `src/scripts/foehn/{pairs,report}.ts` from `server/index.js:241-360` with tests (KLO_LUG thresholds, GVE_GUT sign, Kelvin input); `functions/api/foehn.ts` with the Swiss bbox, `Europe/Zurich` labels, no self-fetch, no state.
- **Accept:** `/api/foehn` returns 4 pairs with Swiss local times; the header pill and Foehn chart work; no CPU-limit errors.

## PR11 `feat/functions-emagram` (parallel with PR10, PR12)

- `scripts/previtemps-grid.ts` writes `src/data/previtemps_grid.json` (`linguist-generated`); `src/scripts/emagram/levels.ts` from `emagram_provider.js:79-181` with tests; functions for `previtemps/stations` and `previtemps/forecast/[name]` (404 for unknown names). Delete `server/data/` and `public/data/previtemps_stations.json`.
- **Accept:** Interlaken returns more than 20 time steps; an unknown name returns 404; the emagram card animates.

## PR12 `feat/obstacles-shards` (needs PR6)

- `scripts/obstacles.ts` plus `src/scripts/obstacles/{lod,cells}.ts` with tests; `ShvApi.getObstacles` reads shards; `deploy.yml` runs `npm run obstacles` with cache and a daily schedule; shards gitignored.
- **Accept:** largest shard under 2 MB; zoom 11 over Interlaken shows obstacles without `/api/obstacles`; a deploy with an empty cache succeeds.

## PR13 `chore/drop-auth` (decided: no member login for now)

- Remove the `/api/auth/*` routes, `server/auth.js` and the `ShvApi` auth methods; stop persisting `shv_session_id` and the profile in localStorage (clear old keys on boot); delete `ProfileView.js` and its `exclude:` entry; `/profile/` becomes a static `.astro` page linking to the SHV member portal. Update `docs/reference/shv-native-app.md` to say login is not implemented, and drop the Keycloak flow from AGENTS.md (intro and the password and token constraints) and README.
- **Accept:** no `auth` route or Keycloak URL outside `docs/`; `/profile/` renders; localStorage holds no session or profile.

## PR14 `refactor/api-client-ts`

- `src/services/api.js` becomes `src/scripts/api.ts`, typed against `types.ts`, without the dead methods; legacy import lines updated in place.
- **Accept:** typecheck passes; every page loads its data on preview.

## PR15 `chore/remove-express-python`

- Capture the emagram fixture first if wanted. Delete `server/`, `express`, `cors`, `setProfilePreset`; dev proxy defaults to :8788; drop `server/index.js` from `exclude:`; update what's left of README, AGENTS.md, `docs/architecture.md`, `docs/setup.md`.
- **Accept:** no `express`, `child_process` or `python3` outside `docs/`; `npm run dev` serves every view; production fully works.

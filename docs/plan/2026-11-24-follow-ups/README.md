# Follow-up plan after the view refactors (2026-11-24)

The [migration plan](../2026-11-23-astro-cloudflare/README.md) has shipped up to PR20 ([#26](https://github.com/simonsteiner/shv-meteo-web/pull/26)): every tab is an Astro page with TypeScript modules, and the API runs as Pages Functions on `https://shv-meteo.pages.dev`. This plan orders what is left: the last two PRs of that plan, the review findings it put off, and the checks and decisions that wait on someone else. Numbers here are F1, F2, ... so they don't clash with GitHub's or the old plan's.

## What is left of the legacy code

- `src/main.js` (108 lines): mounts the header and bottom nav, logs uncaught errors, reloads a page restored from the back/forward cache. It mounts no view any more; every tab is a ported page.
- `src/components/Header.js` and `BottomNav.js`: rendered through `innerHTML`. The header's GPS button already uses `locatePilot` from `src/scripts/maps/locate.ts`.
- `src/state.js` (the store, `store.t`, `store.subscribe`) and `src/i18n/{de,fr,it,en}.js` with `src/i18n/map/*.js` and `index.js`.
- `src/views/` and `src/services/` are gone, and the lefthook file-tokens `exclude:` list is empty and removed.

## Delivery

- **F1 and F2 go up as one `gh stack`** (`gh stack init`, then `gh stack add` per PR, `gh stack submit`), F2 on top of F1, against `main`. A stack is a line, so later items that don't depend on each other are separate PRs off `main`, not siblings in one stack.
- Each PR passes `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, and is used in the browser on `npm run dev`; a PR that changes a page attaches before and after shots from `npm run shot`.
- The owner reviews and merges.

## F1 `refactor/app-shell` (the old plan's PR21)

- **Header and bottom nav as `.astro`** in `src/components/shell/`: real `<a href="/<tab>/">` links, the current tab marked with `aria-current="page"` at build time, the GPS, theme and language controls wired in a page script with `addEventListener`. Words through `data-t` and `applyText` (`src/scripts/i18n/text.ts`), as on the ported pages.
- **`src/scripts/state.ts`** replaces `src/state.js`: typed, the same `shv_*` keys through `src/scripts/settings.ts`, `select(kind, value)` as now. The ported pages import it instead of the legacy store.
- **`src/scripts/i18n/{de,fr,it,en}.ts`** replace `src/i18n/`, the map strings folded back in or kept in their own module per language, each file under the 5,000-token budget. A test checks that the four languages have the same keys.
- **The shell script** keeps what `main.js` does that is still needed: the global `error` and `unhandledrejection` loggers and the back/forward cache reload. Then `src/main.js`, `src/state.js`, `src/components/*.js` and `src/i18n/` are deleted.
- **Docs:** `AGENTS.md` (the intro, "App state lives in `store`", "UI strings come from", the "Every tab is its own page" gotcha, which still says `main.js` mounts the view), `docs/architecture/web.md`, `GLOSSARY.md` if a term changes.
- **Accept:** no `.js` left under `src/`; tab links work without JavaScript; the language and theme switches still apply without a reload on every page; the GPS button still hands `?locate` to the map; shots of the four tabs match `main` apart from live data.

## F2 `feat/csp` (the old plan's PR22, needs F1)

As planned in [prs-views.md](../2026-11-23-astro-cloudflare/prs-views.md) (PR22) with the policy in [conventions.md](../2026-11-23-astro-cloudflare/conventions.md): `src/scripts/access/csp.ts` hashes each inline script at `astro:build:done` and writes the meta CSP after `<meta charset>`; `public/_headers` adds `frame-ancestors 'none'`, `Referrer-Policy` and `nosniff`. No inline event handlers are left in `src/`, and the only inline script is the theme script in `Base.astro`. **Accept:** no CSP violations in the console on the four tabs and the forecast sections, including the Leaflet and Chart.js pages and the upstream images (webcams, outlooks, isobar chart).

## F3 `docs/screenshots` (after F1)

The answer to open question 2: regenerate the README screenshots of the new pages with `npm run shot` and replace the 36 MB `screenshots/` folder with fewer, smaller PNGs. Only real data on the shots; a shot that catches an upstream outage is retaken, not edited.

## F4 `fix/respond-fallback`

`respond.ts` serves the edge cache's last 200 when upstream fails, without checking it. Check that a cached JSON copy parses before serving it, and answer 503 (and log `[respond]`) when it doesn't. Tests in `respond.test.ts`.

## F5 `fix/upstream-body-timeout`

`fetchUpstream` (`src/scripts/upstream/fetch.ts`) times out on the headers only, so a stalled body holds the Function until Cloudflare stops it. Apply the route's `timeoutMs` to the body read as well, for both the streamed proxies and the Functions that parse (Foehn, sounding). Tests with a body that never ends.

## F6 `perf/obstacle-loading`

Three findings from the reviews, in `src/scripts/obstacles/` and `src/scripts/maps/layer-obstacles.ts`:

- a split cell loads all four quarters even when the view covers one;
- the cell cache (`keepRecent`) is capped by count, not by bytes, so a few dense cells can hold a lot of memory;
- a pan aborted mid-load throws away the cells it already loaded.

Measure before and after on a dense area (Valais at z10) with the real shards from `npm run obstacles`, and put the figures in the PR.

## F7 `perf/obstacle-tiles` (spike first)

PR12's spike found upstream's sampled z9 and z12 tiles complete at the zooms they would serve ([data-queries.md](../../architecture/data-queries.md)). Read them above z8 and keep the shards only for z7 and z8, if a wider check confirms it. Cuts the deploy's shard build and the 250 MB of shards. Only after F6, which it would change.

## F8 Sounding on production (a check, not a PR)

Upstream's ICON columns were still broken on 2026-11-24: `/api/meteo/previtemps/forecast/<station>` answers 503 for every station and the emagram shows its empty state. Once a station answers 200, check `/forecast/emagram/` on production and the route's CPU in the Functions metrics. If only some stations keep failing, run `npm run grid` and open a PR with the new grid.

## F9 Cloudflare secrets on the `production` environment (owner)

`deploy.yml` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository secrets, while its deploy job already runs in the `production` environment. Moving the secrets onto that environment (with the deploy branch limited to `main`) keeps them out of any other workflow. A repo-settings change only the owner can make; the PR afterwards only updates `docs/deployment.md`.

## F10 Decisions for the owner

- **Language routes (`/fr/map/`):** open question 1. The default stays no; after F1 the strings are typed modules, so routes would be cheap to add later.
- **Fixes for the upstream repo** ([branching.md](../2026-11-23-astro-cloudflare/branching.md)): the timeseries cache key, the Foehn timezone, the inline `onerror` XSS, the dead Python routes. Optional; each would be a fresh branch from `master` against `unbe/ai-shv-app`.

## F11 `feat/parcel-analysis` (new feature, last)

Port `analyze_sounding` (`e1e5525:server/emagram_calc.py:56-201`) to TypeScript: LCL, moist adiabat, CAPE, inversions, trigger temperature, run in the browser over the real ICON levels, with golden fixtures from the Python at `e1e5525`. Shown on the emagram card. Only worth starting once F8 shows the soundings are back.

## Order

```text
F1 app-shell -> F2 csp                 (one gh stack)
F1 -> F3 screenshots
F4, F5, F6 independent, off main       (F6 before F7)
F8 when upstream recovers -> F11
F9, F10 when the owner decides
```

# Follow-up plan after the view refactors (2026-11-24)

The [migration plan](../2026-11-23-astro-cloudflare/README.md) has shipped up to PR20 ([#26](https://github.com/simonsteiner/shv-meteo-web/pull/26)): every tab is an Astro page with TypeScript modules, and the API runs as Pages Functions on `https://shv-meteo.pages.dev`. This plan orders what is left: the last two PRs of that plan, the review findings it put off, what the capture of the official app's calls ([2026-11-24-shv-app-network-calls.md](../../research/2026-11-24-shv-app-network-calls.md)) showed we don't use yet, and the checks and decisions that wait on someone else. Numbers here are F1, F2, ... so they don't clash with GitHub's or the old plan's.

## Delivery

- A stack is a line, so items that don't depend on each other are separate PRs off `main`.
- Each PR passes `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, and is used in the browser on `npm run dev` (and on `npm run build && npm run preview` when it loads something from a new origin, for the CSP); a PR that changes a page attaches before and after shots from `npm run shot`.
- The owner reviews and merges.

## Shipped

| Item                        | PR                                                                                                                 | What it did                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| F1 `refactor/app-shell`     | [#29](https://github.com/simonsteiner/shv-meteo-web/pull/29)                                                       | header and bottom nav as `.astro`, the store and strings in TypeScript; no `.js` left under `src/`       |
| F2 `feat/csp`               | [#30](https://github.com/simonsteiner/shv-meteo-web/pull/30)                                                       | a hashed meta CSP on every built page, `public/_headers` for `frame-ancestors`, `Referrer-Policy`, `nosniff` |
| F3 `docs/screenshots`       | [#36](https://github.com/simonsteiner/shv-meteo-web/pull/36)                                                       | the README gallery retaken: 10 shots, 36 MB to 4.6 MB (no emagram shot while the soundings are down)    |
| F4 `fix/respond-fallback`   | [#32](https://github.com/simonsteiner/shv-meteo-web/pull/32)                                                       | a stale copy that no longer looks like JSON is dropped and the route answers 503                        |
| F5 `fix/upstream-body-timeout` | [#33](https://github.com/simonsteiner/shv-meteo-web/pull/33)                                                    | the route's deadline covers the body too; a stalled body errors and is never cached                     |
| F6 `perf/obstacle-loading`  | [#35](https://github.com/simonsteiner/shv-meteo-web/pull/35)                                                       | only the quarters a view covers, a cell cache bounded by bytes, shared in-flight loads                  |
| capture of the official app | [#28](https://github.com/simonsteiner/shv-meteo-web/pull/28), [#34](https://github.com/simonsteiner/shv-meteo-web/pull/34) | the app on an Android emulator, its HTTPS calls captured and listed                             |

## Next: small additions from the capture (independent, off `main`)

### F12 `perf/measurements-filter`

`/api/measurements` fetches every parameter for the Alps box: 3.1 MB and 4,177 stations, every minute. The app asks for six parameters and gets 536 KB. Our pages read eight: wind speed, direction and gust, `temperature`, `temperature_2m` and `pressure_standard_msl` (the app's six), plus `pressure_msl` and `pressure_surface` (`src/scripts/weather/stations.ts`). Add `parameters=` to the `measurements` route in `src/scripts/upstream/routes.ts`. Stations that report none of the eight drop out, so measure first: size and station count before and after, and check the box still covers the neighbouring countries the map shows. The Föhn Function makes its own calls and is not affected. **Accept:** the figures in the PR; the map's stations and the weather page's tables unchanged apart from live data.

### F13 `feat/dew-point`

Add `dew_point` to `TIMESERIES_PARAMETERS` and draw it in the station chart next to the temperature; their gap gives a rough cloud base. One call as now, not the app's three. **Accept:** the line on a station that reports it, no line (not a gap filled in) on one that doesn't.

### F14 `feat/segelflugkarte`

The BAZL glider chart as one more base map or overlay in `src/scripts/maps/basemap.ts` (`BASE_LAYERS`, `BASE_MAPS` in `settings.ts`). `wmts.geo.admin.ch` serves it in the 3857 grid (`ch.bazl.segelflugkarte/default/current/3857/{z}/{x}/{y}.png`) with CORS `*`. Check its zoom range and the attribution swisstopo asks for. **Accept:** the layer switch shows it, the choice persists through `shv_*`, no CSP violation on preview.

## F7 `perf/obstacle-tiles` (spike first, F6 has shipped)

PR12's spike found upstream's sampled z9 and z12 tiles complete at the zooms they would serve ([data-queries.md](../../architecture/data-queries.md)). The capture shows the app reads the obstacles as vector tiles from `shv-app-static-prod.ubmeteo.io` (CORS `*`), with 404s for empty tiles beside Switzerland. Read them above z8 and keep the shards only for z7 and z8, if a wider check confirms they are complete; Leaflet would need a vector-tile plugin, so weigh that against the 250 MB of shards and the deploy's shard build.

## F15 `feat/forecast-animations` (after the owner's decision in F10)

`animation/switzerland/animation_overview.json` lists 185 sections: wind at 1,500 to 4,000 m above sea level and at 100, 400 and 800 m above ground, gusts, cloud by level, precipitation (radar plus ICON) and 850 hPa temperature. The host answers CORS `*` and the frames are the frame strips our Outlooks already play, so most of `src/scripts/forecast/outlooks.ts` carries over and no Function is needed; a strip is about 880 KB and only the layer shown is fetched. A new forecast section, `/forecast/animations/`. The European index (60 sections of ICON global, frames per focus point) reuses it later, if at all.

## Later, or never

- **The federal environment layers' vector tiles** (floodplains, game reserves, moorland landscapes, wildlife rest areas). We already show the rest areas and reserves from `wildschutz.geojson`; first check what the tiles add beyond it, then weigh the vector-tile plugin (shared with F7).
- **Skip:** Ubique's and swisstopo's vector base maps, hillshade and elevation tiles (a vector renderer for what the swisstopo raster maps already cover), the provider and product catalogues (nothing to show, 403 to an `Origin`), the home map's `country=ch` variant, app config, usage events and Sentry.

## F8 Sounding on production (a check, not a PR)

Upstream's ICON columns were still broken late on 2026-11-24: `/api/meteo/previtemps/forecast/<station>` answers 503 for Buochs, Sion and Tuttlingen, and the emagram shows its empty state. Once a station answers 200, check `/forecast/emagram/` on production and the route's CPU in the Functions metrics, and add the emagram shot to the README. If only some stations keep failing, run `npm run grid` and open a PR with the new grid.

## F9 Cloudflare secrets on the `production` environment (owner)

`deploy.yml` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository secrets, while its deploy job already runs in the `production` environment. Moving the secrets onto that environment (with the deploy branch limited to `main`) keeps them out of any other workflow. A repo-settings change only the owner can make; the PR afterwards only updates `docs/deployment.md`.

## F10 Decisions for the owner

- **Members-only forecasts (blocks F15):** the official app shows the animations, like the text forecast, to SHV members only ("Nur für Mitglieder"). We already show the text forecast publicly; the animations would put much more of that content on a public site. Ask the SHV first, or decide it is fine.
- **Language routes (`/fr/map/`):** open question 1. The default stays no; the strings are typed modules now, so routes would be cheap to add later.
- **Fixes for the upstream repo** ([branching.md](../2026-11-23-astro-cloudflare/branching.md)): the timeseries cache key, the Foehn timezone, the inline `onerror` XSS, the dead Python routes. Optional; each would be a fresh branch from `master` against `unbe/ai-shv-app`.

## F11 `feat/parcel-analysis` (new feature, last)

Port `analyze_sounding` (`e1e5525:server/emagram_calc.py:56-201`) to TypeScript: LCL, moist adiabat, CAPE, inversions, trigger temperature, run in the browser over the real ICON levels, with golden fixtures from the Python at `e1e5525`. Shown on the emagram card. Only worth starting once F8 shows the soundings are back.

## Order

```text
F12 measurements filter, F13 dew point, F14 Segelflugkarte   independent, off main, now
F7 obstacle tiles spike                                       now (F6 shipped)
F10 members-only decision -> F15 forecast animations
F8 when upstream recovers -> F11
F9, F10 when the owner decides
```

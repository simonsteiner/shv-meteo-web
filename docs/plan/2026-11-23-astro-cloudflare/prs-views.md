# PR stack: views and CSP

## View refactors PR16 to PR21 (PR16 needs PR7, PR8, PR10 and PR14; PR18 to PR20 also PR16, whose shared modules they import; PR19 also PR11, PR20 also PR12; PR21 needs PR13, PR16 and PR18 to PR20)

PR16 to PR20 have merged (see the [README](README.md)). PR21 and PR22 remain; the [follow-up plan](../2026-11-24-follow-ups/README.md) brings their scope up to date with what merged.

Each PR ports one legacy area to `.astro` components and `src/scripts/<concern>/*.ts` modules with tests, escapes every upstream value and replaces inline handlers with `addEventListener`, uses `units.ts` (from PR10) and `src/scripts/escape.ts` (PR16 moves `escapeHtml` there from `BottomSheet.js:578`, with tests), adds its strings to its existing block in `src/i18n/{de,fr,it,en}.js` (all four, per AGENTS.md), adds deep-link query parameters, and drops its files from `exclude:`. Until PR21, a ported page still imports the legacy store from `src/state.js` and the shell from `src/main.js`; PR21 turns them into `state.ts` and `.astro` components and renames `src/i18n/*.js` to `src/scripts/i18n/*.ts`.

**Accept (all):** lint, typecheck, test and build pass; the old file is gone; tests cover the new modules' pure functions (parsing, formatting, escaping, URL parameters); before/after shots of each page are attached to the PR and compared by eye, since live weather differs between them.

| PR | Branch | Scope | Drops from exclude |
| --- | --- | --- | --- |
| PR16 | `refactor/safety-page` | first and smallest, sets the pattern: `SafetyView.js`, `varioAudio.js`; `escape.ts` | none |
| PR17 | `refactor/profile-page` | dropped: PR13 removes the Profile tab | n/a |
| PR18 | `refactor/weather-page` | `WeatherView.js`, Chart.js in `src/scripts/charts/`, `?tab=stations\|webcams&pair=<pair id>` (unknown values ignored) | `WeatherView.js` |
| PR19 | `refactor/forecast-page` | `/forecast/[section]`; `DOMParser` sanitizer: keeps `p`, `b`, `strong`, `br`, `div`, `h1` to `h3` (all the upstream text uses), drops `head`, `style`, `meta`, `script`, unwraps every other element to its text and keeps no attributes, so no library is needed; tested against `<img onerror>` and `<script>`. The emagram section draws the `Sounding` that `ShvApi.getEmagramForecast` builds in the browser (`soundingFromForecast`, [target.md](target.md), Emagram) and draws none for null; PR19 gives that case a visible empty state. If upstream's columns are still broken, the emagram's before and after shots show it, and the PR says so | `ForecastView.js` |
| PR20 | `refactor/map-page` | `src/scripts/maps/{basemap,sites,stations,obstacles,airspace,foehn,webcams}.ts`, `src/scripts/sheet/{site,station,webcam,obstacle}.ts` (one per selection `BottomSheet.js` renders); extends PR5's `?station`, `?webcam`, `?locate` with `site` and `z` (`z` zooms around the selected site or station, else the default centre). The pilot position is asked for in two places, `MapView.js` (`?locate`) and the GPS button in `Header.js`; PR20 puts one copy in `src/scripts/maps/` for PR21's header to import | `MapView.js`, `BottomSheet.js` |
| PR21 | `refactor/app-shell` | `Header`/`BottomNav` as `.astro` with `<a href>`; `state.ts`, `i18n/*.ts`; `main.js` and the legacy folders deleted | none: PR20 left the list empty and removed it; creates `src/components/{Header,BottomNav}.astro`, `src/scripts/state.ts`, `src/scripts/i18n/*.ts`; deletes `src/main.js`, `src/state.js`, `src/components/*.js`, `src/i18n/` (`src/views/` and `src/services/` are already gone) |

## PR22 `feat/csp` (needs PR21)

- `src/scripts/access/csp.ts` and its integration in `astro.config.mjs`, with the policy in [conventions.md](conventions.md); `public/_headers` with, under `/*`: `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- **Files.** Create: `src/scripts/access/csp.ts` and its test, `public/_headers`. Change: `astro.config.mjs`.
- **Tests:** on fixture HTML, every inline script gets its hash, `src` and JSON scripts get none, the meta lands right after `<meta charset>`.
- **Accept:** every built page carries the meta CSP; no console violations on the four tab pages and the forecast sections; a `shot.ts` run on a local copy of the built `/map/` with an `<img onerror>` added (never shipped) shows the handler does not run.

## Dependencies and parallel lanes

```text
PR4 plan -> PR5 shell+TS -+-> PR6 ci
                          +-> PR7 shot -> PR8 css
                          +-> PR9 proxies -+-> PR10 foehn
                                           +-> PR11 emagram
                                           +-> PR12 obstacles (shard path needs PR6)
                                           +-> PR13 drop-auth (also after PR8)

PR10..PR13 -> PR14 api.ts
PR7 + PR8 + PR10 + PR14 -> PR16 safety -> PR18 weather, PR19 forecast (also PR11), PR20 map (also PR12)
PR13 + PR16 + PR18..PR20 -> PR21 shell -> PR22 csp
```

- PR6, PR7 and PR9 can run in parallel once PR5 lands; PR8 follows PR7.
- PR10 to PR13 can run in parallel once PR9 lands.
- PR16 goes first, once PR7, PR8, PR10 and PR14 land; PR18 to PR20 then run in parallel. PR21 comes after all of them and PR13.

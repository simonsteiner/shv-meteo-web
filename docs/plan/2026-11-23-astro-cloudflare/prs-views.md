# PR stack: views and CSP

## View refactors PR16 to PR21 (each needs PR8; parallel with each other)

Each PR ports one legacy area to `.astro` components and `src/scripts/<concern>/*.ts` modules with tests, escapes every upstream value and replaces inline handlers with `addEventListener`, uses `units.ts`, moves strings into `src/scripts/i18n`, adds deep-link query parameters, and drops its files from `exclude:`.

**Accept (all):** lint, typecheck, test and build pass; the old file is gone; before/after shots match.

| PR | Branch | Scope | Drops from exclude |
| --- | --- | --- | --- |
| PR16 | `refactor/safety-page` | pilot, smallest: `SafetyView.js`, `varioAudio.js` | none |
| PR17 | `refactor/profile-page` | dropped: PR13 replaces the profile page | n/a |
| PR18 | `refactor/weather-page` | `WeatherView.js`, Chart.js in `src/scripts/charts/`, `?tab=foehn&pair=` | `WeatherView.js` |
| PR19 | `refactor/forecast-page` | `/forecast/[section]`; `DOMParser` allowlist sanitizer tested against `<img onerror>` and `<script>`; optional `feat/emagram-parcel` | `ForecastView.js` |
| PR20 | `refactor/map-page` | `src/scripts/maps/{basemap,sites,stations,obstacles,airspace,foehn,webcams}.ts`, sheet modules, `?station=&site=&lat&lon&z` | `MapView.js`, `BottomSheet.js` |
| PR21 | `refactor/app-shell` | `Header`/`BottomNav` as `.astro` with `<a href>`; `state.ts`, `i18n/*.ts`; `main.js` and the legacy folders deleted | the `exclude:` block (only `docs/architecture.md` left, split it here too) |

## PR22 `feat/csp` (needs PR18 and PR20)

- the reference project's `src/scripts/access/csp.ts` and integration with `img-src 'self' data: https:`, `connect-src 'self' https:`, `style-src 'self' 'unsafe-inline'`; `public/_headers` with `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`.
- **Accept:** every built page carries the meta CSP; no console violations on the five pages; a test shows an injected inline handler does not run.

## Dependencies and parallel lanes

```text
PR4 plan -> PR5 shell+TS -+-> PR6 ci --------------------------+
                          +-> PR7 shot                         |
                          +-> PR8 css -> PR16..PR21 views -> PR22 csp
                          +-> PR9 proxies -+-> PR10 foehn      |
                                           +-> PR11 emagram    |
                                           +-> PR12 obstacles (needs PR6)
                                           +-> PR13 drop-auth
                                           PR10..PR13 -> PR14 api.ts -> PR15 removal
```

- PR6, PR7, PR8 and PR9 can run in parallel once PR5 lands.
- PR10 to PR13 can run in parallel once PR9 lands.
- PR16 to PR21 can run in parallel once PR8 lands; starting them after PR15 is simpler, since Express no longer has to keep working.

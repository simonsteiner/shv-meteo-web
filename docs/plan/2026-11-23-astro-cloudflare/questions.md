# Open questions

Each open question has a recommended default; the plan assumes the default until decided otherwise.

## Decided (2026-11-23)

- **Pages project:** `shv-meteo`, served at `https://shv-meteo.pages.dev`; no custom domain yet.
- **Docker:** dropped. PR5 deleted it, and PR9 deleted Express.
- **SHV member login:** dropped for now (PR13 `chore/drop-auth`). It reused the official app's public Keycloak client and handled licence and insurance data; revisit if SHV allows a web client, using the cookie design in [target.md](target.md). The Profile tab went with it; the header links to the SHV member portal.
- **Navigation:** one page per tab; handoffs in the map's URL, in-memory settings persisted in localStorage ([target.md](target.md)).
- **Obstacles:** upstream's vector tiles fall short at z7 and z8, so PR12 builds shards at deploy time.
- **Outlooks, isobar chart, station list:** no Functions; the browser loads the first two from upstream, the list is a static file.
- **CSP:** the reference project's integration, not Astro's built-in.
- **Dev backend:** `npm run dev` uses only the Pages Functions.
- **Parcel analysis:** not ported in this plan (see Later).
- **Upstream load:** PR9's spike found the edge cache works on `pages.dev`, so every Function keeps its last 200 as the fallback, and the Foehn badge keeps calling `/api/foehn`; there is no browser Foehn path.
- **Cloudflare plan:** Free. Fresh answers measured on previews take `/api/foehn` a median 5.5 ms CPU (filtered upstream calls, [#18](https://github.com/simonsteiner/shv-meteo-web/pull/18)) and a sounding 3 ms (levels built in the browser, [#20](https://github.com/simonsteiner/shv-meteo-web/pull/20)), under the 10 ms limit; a cached answer takes about 1 ms. The Free plan still caps Functions at 100,000 requests a day, after which they fail until midnight UTC: a map or weather page view makes about three calls (measurements, foehn, and timeseries or webcams), so the cap is roughly 30,000 page views a day. The Workers paid plan lifts it, if traffic ever gets near.
- **Deploys:** on every merge to `main` once ci passes, plus a daily run at 03:17 UTC that rebuilds the obstacle shards (`deploy.yml`).
- **`astro check`:** on pre-push (too slow for pre-commit, as in the reference project) and in CI.
- **Package name and branding:** package `shv-meteo-web`; the UI keeps the name "Swiss Free Flight".
- **Upstream User-Agent:** `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)` (`USER_AGENT` in `src/scripts/upstream/routes.ts`); never poses as the official app.

## Open

1. **Language routes (`/fr/map/`)?** Default no; keep the runtime switch (`shv_lang`, default `de`) until the view refactors have extracted the strings.
2. **The 36 MB `screenshots/` folder?** Default: keep it, regenerate with `scripts/shot.ts` after PR21.

## Later (not in this plan)

The [follow-up plan](../2026-11-24-follow-ups/README.md) orders these and gives each its scope.

- **Parcel analysis for the emagram.** `analyze_sounding` (`e1e5525:server/emagram_calc.py:56-201`) is about 150 lines of closed-form maths: Bolton LCL, Tetens, moist adiabatic lapse rate, CAPE, inversions, trigger temperature. A TypeScript port is about half a day with tests and could run in the browser over the real ICON levels, which `ShvApi.getEmagramForecast` already builds there. Golden fixtures come from `python3 server/emagram_calc.py --test` at `e1e5525`. Only the routes the audit deleted called it, so it would be a new feature.
- **Review findings left for later** (from the reviews of the merged PRs):
  - The Cloudflare secrets on the `production` environment rather than the repo, a repo-settings change.
  - A check that a cached copy parses before `respond.ts` serves it as the fallback.
  - A timeout on a Function's upstream body, not only its headers (`fetchUpstream`; Express had none either).
  - Obstacle loading: a split cell loads all four quarters, the cell cache is capped by count rather than bytes, and an aborted pan throws away the cells it loaded.
- **Obstacle tiles above z8.** PR12's spike found nothing missing from upstream's sampled z9 and z12 tiles at the zooms they would serve, so a later change could read them there and keep shards only for z7 and z8 ([data-queries.md](../../architecture/data-queries.md)).
- **The sounding on production.** On 2026-11-23 upstream's ICON columns were broken (every level at about one pressure), every station failed `pointProblem`, and `/forecast/` showed the sounding's error. Once upstream recovers, check the emagram on production and the route's CPU in the Functions metrics.

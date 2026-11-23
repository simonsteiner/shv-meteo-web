# Open questions

Each has a recommended default; the plan assumes the default until decided otherwise.

## Decided (2026-11-23)

- **Pages project:** `shv-meteo`, served at `https://shv-meteo.pages.dev`; no custom domain yet.
- **Docker:** dropped. PR5 deletes it; Express stays for local dev only until PR9, which deletes it.
- **SHV member login:** dropped for now (PR13 `chore/drop-auth`). It reused the official app's public Keycloak client and handled licence and insurance data; revisit if SHV allows a web client, using the cookie design in [target.md](target.md). The Profile tab goes with it; the header links to the SHV member portal.
- **Navigation:** one page per tab; handoffs in the map's URL, in-memory settings persisted in localStorage ([target.md](target.md)).
- **Obstacles:** PR12 tries upstream vector tiles first and builds shards only if they fall short.
- **Outlooks, isobar chart, station list:** no Functions; the browser loads the first two from upstream, the list is a static file.
- **CSP:** the reference project's integration, not Astro's built-in.
- **Dev backend:** from PR9 `npm run dev` uses only the Pages Functions.
- **Parcel analysis:** not ported in this plan (see Later).
- **Upstream load:** if PR9 finds no edge caching on `pages.dev`, the Foehn badge computes its report in the browser.

## Open

1. **Cloudflare plan?** Default Free. If PR9's spike or PR10's deploy shows `/api/foehn` over the 10 ms CPU limit, take the browser path in [target.md](target.md), as for missing edge caching. The Free plan also caps Functions at 100,000 requests a day, after which they fail until midnight UTC: a map or weather page view makes about three calls (measurements, foehn, and timeseries or webcams), so the cap is roughly 30,000 page views a day; the Workers paid plan lifts it. The emagram forecast has no browser path: if its p99 CPU stays over 10 ms for a week on Free, switch to the paid plan.
2. **Deploy on merge or by hand?** Default: CI deploy on merge to `main`, plus a daily schedule that rebuilds the obstacle shards if PR12 takes the shard path.
3. **Language routes (`/fr/map/`)?** Default no; keep the runtime switch (`shv_lang`, default `de`) until the view refactors have extracted the strings.
4. **`astro check` in pre-commit or pre-push?** Default pre-push (too slow for pre-commit, as in the reference project); CI runs it too.
5. **Package name and branding?** Default: package `shv-meteo-web` (PR5); keep the UI name "Swiss Free Flight".
6. **The 36 MB `screenshots/` folder?** Default: keep it, regenerate with `scripts/shot.ts` after PR21.
7. **Upstream User-Agent?** Default `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`; never pose as the official app.

## Later (not in this plan)

- **Parcel analysis for the emagram.** `analyze_sounding` (`e1e5525:server/emagram_calc.py:56-201`) is about 150 lines of closed-form maths: Bolton LCL, Tetens, moist adiabatic lapse rate, CAPE, inversions, trigger temperature. A TypeScript port is about half a day with tests and could run in the browser over the real ICON levels. Golden fixtures come from `python3 server/emagram_calc.py --test` at `e1e5525`. Only the routes the audit deletes call it today, so it would be a new feature.

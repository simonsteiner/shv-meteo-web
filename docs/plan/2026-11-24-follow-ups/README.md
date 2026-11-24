# Follow-up plan after the view refactors (2026-11-24)

The [migration plan](../2026-11-23-astro-cloudflare/README.md) has shipped up to PR20 ([#26](https://github.com/simonsteiner/shv-meteo-web/pull/26)): every tab is an Astro page with TypeScript modules, and the API runs as Pages Functions on `https://shv-meteo.pages.dev`. This plan orders what is left: the last two PRs of that plan, the review findings it put off, what the capture of the official app's calls ([2026-11-24-shv-app-network-calls.md](../../research/2026-11-24-shv-app-network-calls.md)) showed we don't use yet, and the checks and decisions that wait on someone else. Numbers here are F1, F2, ... so they don't clash with GitHub's or the old plan's.

## Delivery

- A stack is a line, so items that don't depend on each other go up as separate PRs off `main`, unless the owner wants them merged in one go, as with the two station dialog fixes (#46, #47).
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
| F12 `perf/measurements-filter` | [#40](https://github.com/simonsteiner/shv-meteo-web/pull/40) | `/api/measurements` asks upstream for the nine parameters the map and the weather page read: 3.1 MB and 4,179 stations to 2.2 MB and 3,754 (455 KB to 266 KB gzip), the same 3,737 stations drawn |
| F13 `feat/dew-point` | [#41](https://github.com/simonsteiner/shv-meteo-web/pull/41) | `dew_point` in the timeseries call, drawn dashed next to the temperature in the station chart; no line for a station that doesn't report it |
| F14 `feat/segelflugkarte` | [#42](https://github.com/simonsteiner/shv-meteo-web/pull/42) | BAZL's glider chart as a base map, the choice kept in `shv_*` |
| F7 `perf/obstacle-tiles` (research only) | [#43](https://github.com/simonsteiner/shv-meteo-web/pull/43) | the shards stay: upstream's tiles are 99.9% complete, but a z9 tile carries z11 detail, so a z9 view would read about 3 times the bytes and only z12 and z13 views get lighter ([research note](../../research/2026-11-24-obstacle-vector-tiles.md)); revisit if the shards near a Pages limit or upstream cuts tiles per zoom |
| member check research | [#39](https://github.com/simonsteiner/shv-meteo-web/pull/39) | how to tell that a visitor is a current SHV member, and why it needs a client from the SHV ([research note](../../research/2026-11-24-member-check.md)); reshaped F10, F15 and F16 |
| `fix/station-chart-24h` | [#46](https://github.com/simonsteiner/shv-meteo-web/pull/46) | the station dialog's "24h Verlauf" asks upstream for 24 hours, not its default 14 days: KLO 548 KB to 39 KB, a Holfuy station 3.1 MB to 211 KB |
| `fix/dew-point-fallback` | [#47](https://github.com/simonsteiner/shv-meteo-web/pull/47) | the dialog falls back to `dewPointValue`, so the 118 stations that send only that show their dew point |

## F15 `feat/forecast-animations` (after the owner's decision in F10; after F16 if members only)

`animation/switzerland/animation_overview.json` lists 185 sections: wind at 1,500 to 4,000 m above sea level and at 100, 400 and 800 m above ground, gusts, cloud by level, precipitation (radar plus ICON) and 850 hPa temperature. The host answers CORS `*` and the frames are the frame strips our Outlooks already play, so most of `src/scripts/forecast/outlooks.ts` carries over and no Function is needed; a strip is about 880 KB and only the layer shown is fetched. A new forecast section, `/forecast/animations/`. A heading for the winds aloft is in `101eccd^:src/scripts/i18n/*.ts` (`forecast.windAloftTitle`). The European index (60 sections of ICON global, frames per focus point) reuses it later, if at all. If the animations are for members only, F16's member check gates them, so the frames then come through a Function that checks the cookie instead of straight from the host.

## Later, or never

- **The federal environment layers' vector tiles** (floodplains, game reserves, moorland landscapes, wildlife rest areas). We already show the rest areas and reserves from `wildschutz.geojson`; first check what the tiles add beyond it, then weigh the vector-tile plugin (shared with F7).
- **An Open-Meteo sounding fallback while upstream's ICON-CH1 is broken:** spiked on 2026-11-24 and dropped. ICON-D2 through Open-Meteo is free for this site, browser-callable and sane, but it has two to five real levels between a sounding station's ground and 600 hPa against ICON-CH1's 40, too few to read inversions, thermals or cloud base ([research note](../../research/2026-11-24-open-meteo-sounding-fallback.md)). Revisit when Open-Meteo serves MeteoSwiss ICON on levels, or spike AROME France's 50 hPa levels if the outage lasts.
- **Skip:** Ubique's and swisstopo's vector base maps, hillshade and elevation tiles (a vector renderer for what the swisstopo raster maps already cover), the provider and product catalogues (nothing to show, 403 to an `Origin`), the home map's `country=ch` variant, app config, usage events and Sentry.

## F8 Sounding on production (a check, not a PR)

Upstream's ICON columns were still broken late on 2026-11-24. Checked at 21:30 Swiss time: production's `/api/meteo/previtemps/forecast/<station>` answers 503 for Buochs, Sion, Tuttlingen and Interlaken, and the emagram shows its empty state. Every catalogue station's grid point is on ICON-CH1. Its newest run, 18Z, answers 404 for those four points; the 15Z and 12Z runs answer 200 with all 80 levels, but every level holds about the same pressure and temperature (Tuttlingen at 15Z: 616.5 to 620.7 hPa and 262.5 to 262.9 K; Buochs 786 to 788 hPa, Interlaken 790 hPa, Sion 681 to 738 hPa), while `height_half_level` runs from 22,000 m down to the ground (655 m at Tuttlingen) as it should. `pointProblem` rightly rejects every one: pressure falls 0 to 18 hPa from the ground to the model top, against the 300 hPa it asks for. Once a station answers 200, check `/forecast/emagram/` on production and the route's CPU in the Functions metrics, and add the emagram shot to the README. If only some stations keep failing, run `npm run grid` and open a PR with the new grid.

## F9 Cloudflare secrets on the `production` environment (owner)

`deploy.yml` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository secrets, while its deploy job already runs in the `production` environment. Moving the secrets onto that environment (with the deploy branch limited to `main`) keeps them out of any other workflow. A repo-settings change only the owner can make; the PR afterwards only updates `docs/deployment.md`.

## F10 Decisions for the owner

- **Members-only forecasts (blocks F15):** the official app shows the animations, like the text forecast, to SHV members only ("Nur für Mitglieder"). We already show the text forecast publicly; the animations would put much more of that content on a public site. Ask the SHV first (the request for F16's client is the natural place), or decide it is fine. With F16 they can be shown to members only, as in the app.
- **Member check needs a client from the SHV (blocks F16):** Keycloak (`login.shv-fsvl.ch/realms/SHV`) only redirects to the URLs registered for each client. Checked on 2026-11-24: `typo3`, `app-android` and `airspace` (airspace.shv-fsvl.ch) each accept only their own site's callback and answer 400 to `https://shv-meteo.pages.dev/api/auth/callback`. Borrowing one would pass for the SHV's own site or app, and every other way to check membership is ruled out in the [member check research](../../research/2026-11-24-member-check.md). **Action (owner):** send the SHV the request at the end of that note: a confidential client with only our callback, `openid` and the membership role in scope, a dev client for `localhost`, and answers to which role marks a *current* member (the app reads `m`, `c`, `s`, `a`), when a lapsed member loses it, and a test account that isn't a current member.
- **Language routes (`/fr/map/`):** open question 1. The default stays no; the strings are typed modules now, so routes would be cheap to add later.
- **Fixes for the upstream repo** ([branching.md](../2026-11-23-astro-cloudflare/branching.md)): the timeseries cache key, the Foehn timezone, the inline `onerror` XSS, the dead Python routes. Optional; each would be a fresh branch from `master` against `unbe/ai-shv-app`.

## F16 `feat/member-check` (after the SHV registers a client, F10)

Only "current member: yes or no", no profile, as in the [member check research](../../research/2026-11-24-member-check.md) ("Design once the client exists"). This replaces the refresh-token design of [target.md](../2026-11-23-astro-cloudflare/target.md) ("Auth") for that case:

- **First, the acceptance spike** from the note: the owner logs in themselves on `npm run dev`; the debug log shows only claim names, `aud`, `azp` and `realm_access.roles`; the silent re-check works; the SHV's test account comes back as not a member; DevTools shows no token in the browser.
- **Functions:** `/api/auth/start` (PKCE, `state` and `nonce` sealed with AES-GCM in a short `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie; `?silent=1` adds `prompt=none`, `?return=` takes a same-origin path only), `callback` (redeems the code with the client secret, checks the ID token, reads the role, drops every token, redirects to the sealed `return` path) and `logout` (clears the cookie, then `end_session_endpoint`). No token is kept, not even the refresh token; the session cookie holds only `{member, exp}`, no `sub`, name or email.
- **Gating:** member-only content comes from Functions that check the cookie, answering `Cache-Control: private, no-store` and never through `respond.ts`'s edge-cache fallback. An expired or missing cookie gets a `401`, and the page then navigates top-level to `/api/auth/start?silent=1` (a `fetch` can't follow the redirect to the SHV login). Nothing in `dist/` can be member-only.
- **UI:** the header's member portal link gets a login button beside it; a short privacy note says what is checked and kept.
- **Needs** `SESSION_SECRET` and the client's secret as Pages secrets (and `.dev.vars` for the dev client); never an SHV password in our pages, never a token in the browser.

## F11 `feat/parcel-analysis` (new feature, last)

Port `analyze_sounding` (`e1e5525:server/emagram_calc.py:56-201`) to TypeScript: LCL, moist adiabat, CAPE, inversions, trigger temperature, run in the browser over the real ICON levels, with golden fixtures from the Python at `e1e5525`. Shown on the emagram card. Only worth starting once F8 shows the soundings are back. Labels in all four languages are in `101eccd^:src/scripts/i18n/{de,fr,it,en}.ts` under `forecast`: `cloudBase` (LCL), `thermalCeiling`, `triggerTemp`, `surfaceTemp`, `surfaceDew`, `thermalTitle` and `calcSim`, dropped while nothing showed them; restore those the card uses.

## Order

```text
F10 send the SHV the client request -> F16 acceptance spike -> F16 member check
F10 members-only decision (-> F16 if members only) -> F15 forecast animations
F8 when upstream recovers -> F11
F9, F10 when the owner decides
```

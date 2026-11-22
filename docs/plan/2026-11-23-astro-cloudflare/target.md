# Target architecture

## Tree (end state)

```text
astro.config.mjs  wrangler.jsonc  tsconfig.json  .oxlintrc.json  .prettierrc.json  lefthook.yml
functions/api/
  measurements/index.ts  measurements/timeseries/[id].ts  webcams.ts  foehn.ts
  meteo/text-forecast/[lang].ts  meteo/isobaren/[lang].ts  meteo/outlooks.ts
  meteo/previtemps/stations.ts   meteo/previtemps/forecast/[name].ts
public/_redirects   public/data/*.geojson   public/data/obstacles/** (generated, gitignored)
scripts/{dev,obstacles,previtemps-grid,shot}.ts
src/
  types.d.ts                       # ambient declarations only
  layouts/Base.astro   components/*.astro
  pages/{map,weather,forecast,safety,profile}/index.astro
  scripts/
    types.ts                       # shared domain and API shapes
    units.ts  api.ts  state.ts  i18n/*.ts
    upstream/{fetch,params,respond}.ts   foehn/{pairs,report}.ts   emagram/{levels,grid}.ts
    obstacles/{lod,cells}.ts   maps/*.ts   charts/*.ts
    forecast/sanitize.ts   access/csp.ts
  styles/{tokens,chrome,map,sheet,weather,forecast,safety,profile}.css
  data/previtemps_stations.json   data/previtemps_grid.json (generated)
```

## Request flow

Static HTML and `/data/*` come from the Pages CDN; tiles, outlook frames and webcam images load straight from their providers. `/api/*` runs in a Pages Function that validates input, fetches one allowlisted upstream host and streams the answer back with `Cache-Control`. No function parses more than about 1 MB.

Whether edge caching of function responses (Cache API or `cf.cacheTtl`) works on a `pages.dev` hostname is verified in PR9; the fallback is browser `max-age`. No KV for hot data: measurements every 60 s exceed the free plan's 1,000 writes a day.

## Pages and routing

- One static page per tab, `src/pages/<tab>/index.astro`; `/` redirects to `/map/` through `public/_redirects`.
- Plain multi-page navigation, as in the reference project. `store.setTab(tab)` becomes `location.assign('/<tab>/')`.
- Three handoffs need a selection to survive the page load (`WeatherView.js:662-663`, `MapView.js:1613`, `Header.js:172-177`). `state.js` writes the transient selection to `sessionStorage` before navigating and restores it on boot.
- Deep-link query parameters arrive with each view's refactor PR.

## Build-time data

- **BAZL obstacles:** `scripts/obstacles.ts` downloads `bazl.geojson`, applies the LOD tiers from `obstacles_provider.js:150-232` (ported to `src/scripts/obstacles/lod.ts` with tests) and writes `public/data/obstacles/<tier>/<gx>_<gy>.json` in 0.25 degree cells. `deploy.yml` runs it with `actions/cache` and a daily schedule. The client merges the shards covering the padded bbox and keeps the deterministic 2000-feature cap.
- **Previtemps grid points:** `scripts/previtemps-grid.ts` resolves the 107 catalogue stations to their ICON-CH1 point index and elevation once and writes `src/data/previtemps_grid.json`. At runtime the function then needs only the runs list and 6 point-data fetches (about 180 KB).

## Auth (deferred)

Member login is dropped for now (PR13). If it returns, use this design: `start` seals `{verifier, state, exp}` with AES-GCM (WebCrypto, key from `SESSION_SECRET`) into an `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie. `exchange` checks `state`, redeems the code and seals only the refresh token into a session cookie. `profile` refreshes, fetches the member profile and rotates the cookie; `logout` clears it. The profile stays in memory or `sessionStorage`, never localStorage.

## Emagram

Delete the Python. Optionally port `analyze_sounding` to `src/scripts/emagram/parcel.ts` (about 150 lines of closed-form maths: Bolton LCL, Tetens, moist adiabatic lapse rate, CAPE, inversions, trigger temperature; about half a day with tests) and run it in the browser over the real ICON-CH1 levels. Capture golden fixtures from `python3 server/emagram_calc.py --test` before PR15 deletes it.

# Target architecture

## Tree (end state)

```text
astro.config.mjs  wrangler.jsonc  tsconfig.json  .oxlintrc.json  .prettierrc.json  lefthook.yml
functions/api/
  measurements/index.ts  measurements/timeseries/[id].ts  webcams.ts  foehn.ts
  measurements/ch.ts               # browser Foehn path only
  meteo/text-forecast/[lang].ts  meteo/previtemps/forecast/[name].ts
public/_redirects  public/_headers  public/data/*.geojson  public/data/previtemps_stations.json
public/data/obstacles/**           # shard path only (PR12), generated, gitignored
scripts/{dev,previtemps-grid,shot}.ts   scripts/obstacles.ts (shard path only)
src/
  types.d.ts                       # ambient declarations, from the first PR that needs one
  layouts/Base.astro   components/{Header,BottomNav}.astro
  pages/{map,weather,safety}/index.astro   pages/forecast/[section].astro
  scripts/
    types.ts                       # shared domain and API shapes
    units.ts  escape.ts  handoff.ts  settings.ts  api.ts  state.ts  i18n/*.ts
    upstream/{fetch,params,respond,routes}.ts   foehn/{pairs,report,fetch}.ts   emagram/{levels,grid,gridpoint,fetch}.ts
    obstacles/{lod,tiles or cells}.ts   maps/*.ts   sheet/*.ts   charts/*.ts
    safety/*.ts   weather/*.ts   forecast/*.ts   access/csp.ts
  styles/*.css                     # main.css cut into 15 files (PR8)
  data/previtemps_grid.json (generated)
```

## Request flow

Static HTML and `/data/*` come from the Pages CDN; tiles, the outlooks (`days_overview.json` and its frames), the isobar SVG and webcam images load straight from their providers: outlooks answer with CORS `*`, and the SVG is only used in `<img>`, which never runs its scripts. The other upstreams need a Function: `weather-ws-prod.ubmeteo.io` (measurements, timeseries, and point data, the ICON forecast series per grid point) and `webcam-prod.ubmeteo.io` answer 403 when a browser sends an `Origin` header, and the text forecast host `shv-app-ws-prod.shv-app.ch` sends no CORS header. Each route's upstream URL is a constant in `src/scripts/upstream/routes.ts`; no request picks a host. Foehn makes three calls: the measurements of the Swiss bbox and two timeseries for the history. No function parses more than about 1 MB.

Rules every Function keeps, so the legacy client works unchanged. Each Function is a one-line adapter; the rules live in `routes.ts` (upstream URL, TTL, error texts per route) and `params.ts`, where the tests run. The upstream request carries the User-Agent from [questions.md](questions.md) item 7 and no `Origin`.

- **Input:** path parameters are decoded once with `decodeURIComponent` (a malformed escape is a 400). `measurements` takes no query: it always asks for today's default bbox (lat 43.5 to 49.5, lon 4 to 16, `server/index.js:144-147`), since no caller sends one; `measurements/ch` is the same with the Swiss bbox (lat 45.8 to 47.8, lon 5.9 to 10.5). A timeseries id must then match `^[a-z_]+:[^/\s]{1,100}$` (upstream ids include `meteo_swiss:KLO` and `mistral:dpcn-piemonte:46.30361,8.36639`). The text forecast's `lang` is `de`, `fr` or `it`; anything else, including the UI's `en`, falls back to `de` as today (`server/index.js:500`); the client maps `en` to `de` for the isobar SVG itself. Forecast names match the 107-station catalogue in `public/data/previtemps_stations.json` case-insensitively, as `server/index.js:702` does; names may contain `/` (`Disentis/Mustér`).
- **Statuses:** upstream 2xx: 200, body streamed. Timeout (8 s, 12 s for measurements, as today), network error or any upstream non-2xx, 4xx included: 503 with a German `error`: "Live-Messwerte vorübergehend nicht erreichbar" plus `features: []` (measurements), "Webcams vorübergehend nicht erreichbar" plus `webcams: []`, "Stations-Zeitreihe vorübergehend nicht erreichbar", "Textprognose vorübergehend nicht erreichbar" (today's texts, `server/index.js:176`, `:206`, `:525`, `:574`), and for the routes that answered 500 with `err.message` today, "Föhndaten vorübergehend nicht erreichbar" and "Sondierung vorübergehend nicht erreichbar". Foehn: a failed measurements call is the 503; a failed or empty timeseries only empties `history` (200). A bad timeseries id: 400 "Ungültige Stations-ID". An unknown forecast name: 404 "Unbekannte Sondierungsstation".
- **Headers:** the response carries upstream's `Content-Type` (default `application/json; charset=utf-8`) and its own `Cache-Control`, nothing else from upstream (no `Set-Cookie`, CORS or upstream caching headers).
- **`Cache-Control`:** `max-age` on a 200 only: measurements 60, webcams 120, timeseries 180, text forecast 900, emagram forecast 1200 (today's TTLs), and foehn 60 (new; today it reuses the measurements cache). Every other status gets `no-store`, so an outage isn't cached.

Express also served its last good copy when an upstream failed (`server/index.js:173-174`, `:203-204`, `:522-523`). Functions have no memory, so that depends on PR9's spike:

- **Edge cache works:** `respond.ts` puts each 200 in `caches.default`, keyed by the path plus the parameters the route accepts (`pair` for foehn; any other query is dropped), kept 24 hours with an `x-fetched-at` header. It tees the body: one branch streams to the client, the other is stored through `context.waitUntil`. A copy younger than the route's TTL is served without calling upstream; an older one triggers a refetch and is served if the refetch fails. `src/types.d.ts` declares `caches.default`.
- **It doesn't:** only browser `max-age` is left, an upstream blip shows the 503 state (an accepted regression), and upstream load grows with visitors, while every page shows the Foehn badge (the Gotthard pressure difference in the header) and fetches `/api/foehn`. Then PR10 also ships `foehnReport()` (a pure module) to the browser. The badge, the map's Foehn layer (`MapView.js:775`) and the pair cards on `/weather/` (`WeatherView.js:36`) compute the report from the measurements their page already loads; badge-only pages (`/forecast/` and `/safety/`, chosen by `data-view`) fetch `/api/measurements/ch` (about 0.84 MB, `max-age=600`, so the browser cache serves the badge for 10 minutes). `ShvApi.getMeasurements()` keeps one promise per page load, so the badge reuses the view's fetch on `/map/` and `/weather/`. `/api/foehn` then answers `{ history, updatedAt }` only, and `WeatherView` merges `history` into its report instead of replacing it (`WeatherView.js:555-556`).

Either way `ShvApi.getFoehn(pairId)` keeps one promise per pair per page load (no argument counts as `KLO_LUG`), so the badge and the view on the same page make one call and the pair switcher still gets its pair.

No KV for hot data: measurements every 60 s exceed the free plan's 1,000 writes a day.

## Module interfaces

Storage, `fetch` and the clock are parameters, so `node --test` can pass fakes. Types are those `state.js` and the upstream JSON use today, named in `types.ts`.

```ts
// handoff.ts (PR5)
type Handoff = { station: string } | { webcam: string } | { locate: true };
handoffUrl(h: Handoff): string                       // "/map/?station=meteo_swiss%3AKLO"
readHandoff(search: string): Handoff | null          // first valid parameter, else null
// settings.ts (PR5; purgeLegacyAuth PR13)
loadSettings(local: Storage): Settings               // lang, theme, baseMap, mapCategory, meteoMode, layers, windFilter, varioRate, flights
saveSetting<K extends keyof Settings>(local: Storage, key: K, value: Settings[K]): void
loadChecklist(session: Storage): Record<string, boolean>
saveChecklist(session: Storage, checklist: Record<string, boolean>): void
purgeLegacyAuth(local: Storage): void
// upstream/ (PR9)
interface Route { url?(params: Record<string, string>): string; ttl: number; timeoutMs: number; errorBody: object; query: string[] }
// foehn and sounding make several calls (foehn/fetch.ts, emagram/fetch.ts); their Route gives only ttl, timeout (8 s per call), errorBody and cache key
ROUTES: Record<"measurements" | "measurementsCh" | "timeseries" | "webcams" | "textForecast" | "foehn" | "sounding", Route>
parseParams(route: keyof typeof ROUTES, path: Record<string, string>, search: URLSearchParams): Record<string, string> | Response  // path params plus the route's allowed query keys; a 400 Response when invalid; an unknown foehn pair becomes KLO_LUG, as today (server/index.js:443)
fetchUpstream(url: string, timeoutMs: number, fetchFn?: typeof fetch): Promise<Response>  // sets the User-Agent, never Origin
respond(route: Route, key: string, fetcher: () => Promise<Response>, ctx: Context, cache?: Cache, now?: number): Promise<Response>  // looks in the cache first, calls fetcher only when needed
// foehn/report.ts (PR10)
foehnReport(measurements: MeasurementFeature[], histories: Record<string, TimeseriesResponse | null>, pairId: string, now: Date): FoehnReport
// emagram/ (PR11)
gridPoint(name: string, grid: PrevitempsGrid): GridPoint | null
parsePointData(raw: unknown): number[][]                // levels x time steps, from data.levels[l].ensembleMembers[0].timeSeries (emagram_provider.js:125-131)
soundingLevels(byParam: Record<string, number[]>): SoundingLevel[]  // one time step, one array per parameter over the levels
// obstacles/ (PR12)
visibleAt(f: ObstacleFeature, zoom: number): boolean
capFeatures(fs: ObstacleFeature[], max?: number): ObstacleFeature[]          // default 2000, order as below
tilesFor(bbox: Bbox, zoom: number): { z: number; x: number; y: number }[]    // tile path
decodeTile(data: ArrayBuffer, z: number, x: number, y: number): ObstacleFeature[]  // sets properties._uid (id without the geometry type, which clipping can change) and properties._tile
drawKey(f: ObstacleFeature, z: number, x: number, y: number): string
tierFor(zoom: number): Tier; cellsFor(bbox: Bbox, tier: Tier): string[]; cellsOf(f: ObstacleFeature, tier: Tier): string[]  // shard path
```

`ShvApi.getObstacles({ minLon, minLat, maxLon, maxLat, zoom }, { signal })` keeps today's signature and returns today's FeatureCollection plus `_uid` and `_tile`, so `MapView` only changes its draw key. `Context` (the Functions' context type) is declared once in `types.ts`. The forecast sanitizer (PR19) takes a `parse(html): Document` argument; the browser passes `DOMParser`, the tests `linkedom` (a dev dependency).

## Pages and routing

- One static page per tab, `src/pages/<tab>/index.astro`; each passes its tab as `view` to `Base.astro`, which sets `<body data-view>`. `/` redirects to `/map/` through `public/_redirects`.
- Plain multi-page navigation, as in the reference project. `store.setTab(tab)` becomes `location.assign('/<tab>/')`.
- Three handoffs carry a selection to the map in its URL: `/map/?station=<id>` (`WeatherView.js:662-663`), `/map/?webcam=<identifier>` (`WeatherView.js:629-630`) and `/map/?locate` for the pilot location (`Header.js:172-177`), where the map asks for the position again (permission is already granted) so coordinates never land in the URL or history. The legacy `MapView` reads them on mount, then removes them with `history.replaceState` so a reload doesn't select again; only one is ever set (the handoff that navigates writes its own); `?locate` that fails to get a position leaves the map at its default view, without the default pilot location `Header.js:184` sets today. PR20 extends the same parameters.
- Settings that live only in memory today (`state.js:20-66`) would reset on every page load, so they persist in localStorage under `shv_*` keys: `baseMap`, `mapCategory`, `meteoMode`, `layers`, `windFilter`, `varioRate` (`varioMuted` starts muted on every page, since audio may only start on a click). `src/scripts/settings.ts` loads and saves them, together with the keys `state.js` already stores (`shv_lang`, `shv_theme`, `shv_flights`), taking the storage object as a parameter for tests: each key falls back to today's default (`state.js:15-66`) when missing, unparsable or not an allowed value (`lang` `de|fr|it|en`; `theme` `dark|light`; `baseMap` `topoLight|topoColor|topoSatellite|topoOsm`; `mapCategory` `METEO|AIRSPACE|FLYING_AREAS`; `meteoMode` `WIND|TEMPERATURE|PRESSURE_DIFFERENCE|WEBCAM|NONE`; `windFilter` a subset of the eight compass points; `varioRate` a number from -5 to 6, the slider's range; `flights` an array, whose entries pass through unchanged as today), and `layers` is merged over the defaults so a new layer gets its default. The pre-flight `checklist` goes to `sessionStorage` instead: it survives moving between pages but not closing the tab, so yesterday's ticks never show as done. The search query is transient and resets.
- Clicking the active Map tab clears the search, `shv_windFilter` and the selections, then reloads `/map/`, as `resetMapState` does today (`state.js:159-179`).
- An inline script in the head of `Base.astro` sets `data-theme` from `shv_theme` before the first paint, so a light theme doesn't flash dark on each page; PR22's CSP hashes it.
- Deep-link query parameters arrive with each view's refactor PR.
- Text stays rendered in the browser from the `src/i18n/` dictionaries through `store.t`, as today, so the runtime language switch keeps working; `.astro` markup holds only the language-neutral frame. Build-time text comes only with language routes ([questions.md](questions.md) item 3).
- Forecast is the one tab with a page per section: until PR19 it is `forecast/index.astro`; PR19 replaces it with `forecast/[section].astro`, whose `getStaticPaths` returns `text`, `outlooks`, `emagram` and `isobaren` (the sections at `ForecastView.js:292-301`), and `public/_redirects` sends `/forecast/` to `/forecast/text/`.

## Build-time data

- **BAZL obstacles, tile spike first (PR12):** upstream also serves the dataset as MVT tiles, `https://shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf`, with CORS `*`. The LOD (level of detail) rules (`obstacles_provider.js:158-227`) decide what shows at each zoom: nothing below z7; up to z11, lines and point symbols need a `MARKED` marking (marked obstacles are always shown) or a height that drops as zoom rises; cable pylon dots only from z13; polygons always. The tiles pass if they cover Switzerland from z7 to z13, give every feature a stable id (the MVT `id`, or `sourceId` plus `partIndex`), and carry what the LOD rules, icons and bottom sheet read: `obstacleType`, `marking`, `styleId` (`MapView.js:1071-1198`), `maxHeightAgl`, `small` (the LOD, `obstacles_provider.js:200-226`), `lighting`, `topElevationAmsl`, `sourceId`, `airport` (`BottomSheet.js:405-490`). Then the client decodes the visible tiles at `min(z, 13)` (nothing below z7), sets `geometryType` from the decoded geometry as the server does (`obstacles_provider.js:280`), and filters with the LOD rules. A line cut into fragments across tiles keeps every fragment: `MapView` dedupes drawn features by a draw key, `_uid` (the feature key defined with the cap below) plus the tile's `z/x/y` (today it dedupes by `getObstacleId`, `MapView.js:1229-1235`, which would drop all but the first fragment), while the cap below counts by `_uid` alone. The spike checks this by decoding the tiles over the Swiss bbox at z7, z10 and z13 and comparing feature count and property keys with `bazl.geojson` for the same bbox. Nothing is built at deploy time.
- **BAZL obstacles, shard path** (only if the spike fails): `scripts/obstacles.ts` downloads `https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson` (the file `obstacles_provider.js:5` loads today), applies the LOD rules from `obstacles_provider.js:150-232` and writes `public/data/obstacles/<tier>/<gx>_<gy>.json`. Tiers `z7`, `z9`, `z10`, `z11`, `z12` and `z13` (the code's cut points) each hold every feature visible from that zoom, so the client reads one tier. Cells are 1 degree for `z7` and `z9`, 0.5 for `z10`, 0.25 from `z11`, so a phone or laptop view needs about 25 files at any zoom. Empty cells are not written and the client treats a 404 as empty. A feature goes into every cell its bbox touches and the client dedupes by id. Files are GeoJSON FeatureCollections keeping only the properties the client reads today (`obstacles_provider.js:264-282`) plus `small`; a cell over 2 MB splits into four. The client loads the cells of the bbox padded by one cell. `deploy.yml` runs it daily, caching the downloaded `bazl.geojson` with `actions/cache` under a key holding the date (`bazl-<YYYY-MM-DD>`, restore key `bazl-`), so the data is at most a day old and one deploy a day downloads it.
- Either way the client applies the 2000-feature cap per view, which today runs on the server (`obstacles_provider.js:236-256`): sorted by marked first, then cable cars, then `maxHeightAgl` descending, then `_uid` ascending, where `_uid` is `<sourceId or id>_<geometry type>[_<partIndex>]` (`getFeatureKey`, `:86-92`), so panning never changes which features show.
- **Previtemps grid points:** `npm run grid` (`node scripts/previtemps-grid.ts`) resolves the 107 catalogue stations to their ICON model key (CH1, or CH2 where a tile has no CH1 grid, as `emagram_provider.js:29-31` does), point index, elevation and grid-point position once, from the zoom-10 grid tiles on `static-prod.ubmeteo.io` (`emagram_provider.js:14-54`; needs network), and writes `src/data/previtemps_grid.json`, which is committed: `{ "<lower-cased name>": { name, modelKey, model, pointIndex, elevation, latitude, longitude } }`. The Function returns today's payload fields unchanged (`emagram_provider.js:183-192`). A station with no CH1 or CH2 grid fails the script, naming it. At runtime the function needs only the runs list of the station's model (CH1 and CH2 have separate runs, `weather-ws-prod.ubmeteo.io/v1/point-data/<modelKey>/runs`) and 6 point-data fetches (about 180 KB). When a point fetch fails it answers 503 and logs the station (Pages real-time logs, or `wrangler pages deployment tail`); a station that shows the 503 state for a day is the sign to rerun the script. No alert watches for it: the owner finds out from users or by reading those logs.

## Auth (deferred)

Member login is dropped for now (PR13). If it returns, use this design: `start` seals `{verifier, state, exp}` with AES-GCM (WebCrypto, key from `SESSION_SECRET`) into an `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie. `exchange` checks `state`, redeems the code and seals only the refresh token into a session cookie. `profile` refreshes, fetches the member profile and rotates the cookie; `logout` clears it. The profile stays in memory or `sessionStorage`, never localStorage.

## Emagram

Delete the Python. The parcel analysis in `analyze_sounding` is not ported in this plan; what it computes is kept under "Later" in [questions.md](questions.md).

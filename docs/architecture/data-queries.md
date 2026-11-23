# Data queries: direct from the browser or through a Function

The browser calls an upstream directly when it allows CORS and the payload is light. Anything else goes through a Pages Function in [functions/api/](../../functions/api/): an upstream that refuses browsers (weather-ws-prod and webcam-prod answer 403 to an `Origin` header; the text forecast host sends no CORS header), heavy data, or maths over several stations. Each Function is a one-line adapter over [src/scripts/upstream/](../../src/scripts/upstream/), where the rules live and the tests run:

- **[routes.ts](../../src/scripts/upstream/routes.ts)**: each route's fixed upstream URL, TTL, timeout and German error body. No request picks a host.
- **[params.ts](../../src/scripts/upstream/params.ts)**: path parameters decoded once; a timeseries id must be `<provider>:<id>` without `/` (else 400 "Ungültige Stations-ID"); the text forecast's language is `de`, `fr` or `it`, anything else `de`.
- **[fetch.ts](../../src/scripts/upstream/fetch.ts)**: the User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`, never an `Origin`, a timeout on the response headers.
- **[respond.ts](../../src/scripts/upstream/respond.ts)**: a 200 streams upstream's body unparsed with upstream's `Content-Type` and `Cache-Control: max-age=<TTL>`, nothing else from upstream; a timeout, network error or any upstream non-2xx is a 503 with the route's error body and `no-store`. Each 200 is kept in the edge cache (`caches.default`) for a day: a copy younger than the TTL is served without calling upstream (`x-cache: hit`), an older one is refetched and still served when the refetch fails (`x-cache: stale`, `no-store`). PR9's spike, below, showed `pages.dev` keeps these copies.

## Data flow

| Resource | Upstream | Path | Why | What happens on the way |
| :--- | :--- | :--- | :--- | :--- |
| **Swisstopo and OSM tiles** | `wmts.geo.admin.ch`, `*.tile.openstreetmap.org` | **Direct** | Public tile caches with CORS. | None; Leaflet loads the images. |
| **Flying sites, airspaces, wildlife zones** | `public/data/*.geojson`, falling back to `shv-app-static-prod.ubmeteo.io` | **Direct** | Snapshots served by Pages; the CDN allows CORS. | None: the local copy first, the live CDN only if it fails. |
| **Outlook frames and index** | `static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json` and its WebP frames | **Direct** | CORS `*`. | None; `ShvApi.getOutlooks` fetches `OUTLOOKS_URL` ([src/scripts/api.ts](../../src/scripts/api.ts)). |
| **Isobar chart** | `shv-app-ws-prod.shv-app.ch/v1/text/isobaren/{lang}.svg` | **Direct** | Used only as an `<img>`, which needs no CORS and never runs the SVG's scripts. | `isobarenUrl(lang)` maps `en` and anything unknown to `de`. |
| **DABS card** | None | **Browser** | Today's date and fixed Skybriefing links. | `buildDabs(now)` in [src/scripts/api.ts](../../src/scripts/api.ts), dated in Swiss time. |
| **Live ground stations (`/api/measurements`)** | `weather-ws-prod.ubmeteo.io/v1/measurements/current` | **Function** | 403 to browsers; 3.1 MB. | Always the Alps bbox (lat 43.5 to 49.5, lon 4 to 16), no query accepted; 12 s timeout; `max-age=60`. |
| **Station timeseries (`/api/measurements/timeseries/:id`)** | `weather-ws-prod.ubmeteo.io/v1/measurements/timeseries/{id}` | **Function** | 403 to browsers. | Fixed parameter list `wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity`, no `?parameters=`; `max-age=180`. |
| **Webcams (`/api/webcams`)** | `webcam-prod.ubmeteo.io/v1/webcams/overview` | **Function** | 403 to browsers. | Fixed Swiss bbox (west 5.9, south 45.8, east 10.5, north 47.8); `max-age=120`. |
| **Text forecast (`/api/meteo/text-forecast/:lang`)** | `shv-app-ws-prod.shv-app.ch/v1/text/forecast/{lang}.json` | **Function** | No CORS header. | `de`, `fr`, `it`, else `de`; `max-age=900`. |
| **Foehn station pairs (`/api/foehn`)** | `weather-ws-prod.ubmeteo.io`: the measurements of the Swiss bbox and the pair's two timeseries | **Function** | Maths over several stations. | [src/scripts/foehn/](../../src/scripts/foehn/): the four pairs' differences and alert levels, their GeoJSON, and `?pair=` (unknown: `KLO_LUG`) adds that pair's 24 h history, labelled in Swiss time. A failed measurements call is the 503 "Föhndaten vorübergehend nicht erreichbar"; a failed or empty series only empties `history`. `max-age=60`, cached per pair. |
| **Sounding station catalogue** | `public/data/previtemps_stations.json` | **Static** | 107 stations, served by Pages. | `ShvApi.getPrevitempsStations` loads the file; no Function. |
| **Sounding forecast (`/api/meteo/previtemps/forecast/:name`)** | `weather-ws-prod.ubmeteo.io/v1/point-data/<model>/runs` and six point-data series | **Function** | Point data refuses browsers; several calls and the level maths. | The station's ICON grid point comes from `src/data/previtemps_grid.json` (`npm run grid`, ICON-CH1 before ICON-CH2); a name outside the catalogue is a 404 "Unbekannte Sondierungsstation", matched case-insensitively, `/` allowed. [src/scripts/emagram/levels.ts](../../src/scripts/emagram/levels.ts) turns each time step into levels up to 550 hPa (dew point, wind, lapse rate). A failed call is the 503 "Sondierung vorübergehend nicht erreichbar". `max-age=1200`. |
| **BAZL obstacles** | `public/data/obstacles/<tier>/<cell>.json`, built from `shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson` | **Static** | 128 MB dataset: too big for a Function or the browser whole. | `npm run obstacles` ([scripts/obstacles.ts](../../scripts/obstacles.ts)) writes one tier per LOD cut point (z7, z9, z10, z11, z12, z13), each holding every feature visible from its zoom, in cells of 1, 0.5 or 0.25 degrees; a cell over 2 MB is split in four. `ShvApi.getObstacles` reads `index.json` once, loads the cells the view touches, dedupes by `_uid`, cuts to the view and caps at 2000 ([src/scripts/obstacles/](../../src/scripts/obstacles/)). `deploy.yml` rebuilds them daily. |
| **Member login (`/api/auth/*`)** | SHV Keycloak | **Dropped** | Reused the official app's public client. | Gone with the Profile tab; the header links to the SHV member portal. |

Express and its Python parcel analysis are gone (PR9), and so is `/api/obstacles` (PR12). The routes nothing called (`/api/health`, `/api/emagram/calculate`, `/api/meteo/previtemps/sounding*`, `/api/obstacles/tiles/*`) were not ported.

## Spike: edge caching and CPU on pages.dev (PR9, 2026-11-23)

Run as branch previews of project `shv-meteo`: PR9's spike Function (`spike`), then the stack head with the real routes (`stack`). CPU times are Cloudflare's own, from the GraphQL analytics (`pagesFunctionsInvocationsAdaptiveGroups`) for the spike and from `wrangler pages deployment tail` per request for the real routes; `Date.now()` inside a Function stands still during compute, so it can't time it.

- **Edge cache: works.** `caches.default` on `pages.dev` kept the copy: the first request said `x-cache: miss`, requests 46 s and 2 min 17 s later said `hit` with the first one's `x-fetched-at`. On the stack preview every route answered `miss` first and carried its `max-age`.
- **Params: one undecoded segment.** `/api/_spike/Disentis%2FMust%C3%A9r` gave `params.path = ["Disentis%2FMust%C3%A9r"]`, as `wrangler pages dev` does locally, so `[name].ts` with `decodeURIComponent` (`params.ts`) is right, and `Disentis%2FMust%C3%A9r` answers 200 on the preview.
- **CPU: over the 10 ms Free limit for Foehn.** The spike route (Swiss-bbox measurements and two six-parameter series parsed) took p50 10.6 ms, p90 14.9 ms, p99 21.4 ms over 28 requests. The real `/api/foehn`, freshly computed (each pair once a minute, 12 requests), took 8 to 29 ms, median 16.5 ms; served from the edge cache it takes about 1 ms. Every request succeeded, but the Free plan does not promise that above 10 ms. Most of it is parsing the 0.8 MB Swiss measurements for eight stations: a ±0.01° box around each station returns about 2 KB holding it, and each pair's one-parameter series is about 80 KB. A fresh sounding (`Disentis/Mustér`) took 13 ms.
- **Sounding coverage: 6 of 107 stations.** Upstream point data exists only for some ICON-CH1 points: in the 06 UTC run only Beggingen, Zürich, Buochs, Schiers, Disentis/Mustér and Interlaken answered; every other station's points (and Interlaken's neighbours) answer 404, so their soundings are the 503 state. `npm run grid` resolves the same points, and the legacy Express code (`e1e5525:server/emagram_provider.js:92-110`) made the same calls, so this is upstream's, not the migration's.

## Spike: BAZL vector tiles (PR12, 2026-11-23)

Upstream serves the dataset as MVT tiles (`shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf`, CORS `*`), but only at z6, z9 and z12. Decoded and compared with `bazl.geojson` against the LOD rules:

| Tile | Size (gzip on the wire / decoded) | Zooms it would serve | Features visible there | Missing from the tile |
| :--- | :--- | :--- | :--- | :--- |
| `6/33/22` (all of Switzerland) | 2.4 MB / 8.4 MB, 97,874 features | z7, z8 | 8,808 | 667: the tile holds no points at all, so every tall or marked mast, crane, stack and windmill is gone |
| `9/267/180` (Bernese Oberland) | 0.34 MB / 1.1 MB, 11,713 features | z9 to z11 | 1,679 / 3,046 / 11,533 | 0 |
| `12/2137/1445` (Interlaken) | 6 KB / 17 KB, 184 features | z12, z13 | 82 / 184 | 0 |

Every tile feature has a stable `id` and carries `obstacleType`, `marking`, `styleId`, `maxHeightAgl`, `small`, `lighting`, `topElevationAmsl`, `sourceId` and `airport`. The tiles fall short at z7 and z8 (MapView shows obstacles from z8), so PR12 took the shard path. A later change could read the z9 and z12 tiles for z9 and up and keep shards only for the overview.

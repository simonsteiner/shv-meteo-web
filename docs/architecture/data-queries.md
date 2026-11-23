# Data queries: direct from the browser or through a Function

The browser calls an upstream directly when it allows CORS and the payload is light. Anything else goes through a Pages Function in [functions/api/](../../functions/api/): an upstream that refuses browsers (weather-ws-prod and webcam-prod answer 403 to an `Origin` header; the text forecast host sends no CORS header), heavy data, or maths over several stations. Each Function is a one-line adapter over [src/scripts/upstream/](../../src/scripts/upstream/), where the rules live and the tests run:

- **[routes.ts](../../src/scripts/upstream/routes.ts)**: each route's fixed upstream URL, TTL, timeout and German error body. No request picks a host.
- **[params.ts](../../src/scripts/upstream/params.ts)**: path parameters decoded once; a timeseries id must be `<provider>:<id>` without `/` (else 400 "Ungültige Stations-ID"); the text forecast's language is `de`, `fr` or `it`, anything else `de`.
- **[fetch.ts](../../src/scripts/upstream/fetch.ts)**: the User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`, never an `Origin`, a timeout on the response headers.
- **[respond.ts](../../src/scripts/upstream/respond.ts)**: a 200 streams upstream's body unparsed with upstream's `Content-Type` and `Cache-Control: max-age=<TTL>`, nothing else from upstream; a timeout, network error or any upstream non-2xx is a 503 with the route's error body and `no-store`. Each 200 is kept in the edge cache (`caches.default`) for a day: a copy younger than the TTL is served without calling upstream (`x-cache: hit`), an older one is refetched and still served when the refetch fails (`x-cache: stale`, `no-store`). Whether `pages.dev` really keeps these copies is PR9's spike, below.

## Data flow

| Resource | Upstream | Path | Why | What happens on the way |
| :--- | :--- | :--- | :--- | :--- |
| **Swisstopo and OSM tiles** | `wmts.geo.admin.ch`, `*.tile.openstreetmap.org` | **Direct** | Public tile caches with CORS. | None; Leaflet loads the images. |
| **Flying sites, airspaces, wildlife zones** | `public/data/*.geojson`, falling back to `shv-app-static-prod.ubmeteo.io` | **Direct** | Snapshots served by Pages; the CDN allows CORS. | None: the local copy first, the live CDN only if it fails. |
| **Outlook frames and index** | `static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json` and its WebP frames | **Direct** | CORS `*`. | None; `ShvApi.getOutlooks` fetches `OUTLOOKS_URL` ([src/scripts/client.ts](../../src/scripts/client.ts)). |
| **Isobar chart** | `shv-app-ws-prod.shv-app.ch/v1/text/isobaren/{lang}.svg` | **Direct** | Used only as an `<img>`, which needs no CORS and never runs the SVG's scripts. | `isobarenUrl(lang)` maps `en` and anything unknown to `de`. |
| **DABS card** | None | **Browser** | Today's date and fixed Skybriefing links. | `buildDabs(now)` in [src/scripts/client.ts](../../src/scripts/client.ts), dated in Swiss time. |
| **Live ground stations (`/api/measurements`)** | `weather-ws-prod.ubmeteo.io/v1/measurements/current` | **Function** | 403 to browsers; 3.1 MB. | Always the Alps bbox (lat 43.5 to 49.5, lon 4 to 16), no query accepted; 12 s timeout; `max-age=60`. |
| **Station timeseries (`/api/measurements/timeseries/:id`)** | `weather-ws-prod.ubmeteo.io/v1/measurements/timeseries/{id}` | **Function** | 403 to browsers. | Fixed parameter list `wind_speed,wind_direction,wind_gust,temperature,pressure_msl,relative_humidity`, no `?parameters=`; `max-age=180`. |
| **Webcams (`/api/webcams`)** | `webcam-prod.ubmeteo.io/v1/webcams/overview` | **Function** | 403 to browsers. | Fixed Swiss bbox (west 5.9, south 45.8, east 10.5, north 47.8); `max-age=120`. |
| **Text forecast (`/api/meteo/text-forecast/:lang`)** | `shv-app-ws-prod.shv-app.ch/v1/text/forecast/{lang}.json` | **Function** | No CORS header. | `de`, `fr`, `it`, else `de`; `max-age=900`. |
| **Foehn station pairs (`/api/foehn`)** | `weather-ws-prod.ubmeteo.io`: the measurements of the Swiss bbox and the pair's two timeseries | **Function** | Maths over several stations. | [src/scripts/foehn/](../../src/scripts/foehn/): the four pairs' differences and alert levels, their GeoJSON, and `?pair=` (unknown: `KLO_LUG`) adds that pair's 24 h history, labelled in Swiss time. A failed measurements call is the 503 "Föhndaten vorübergehend nicht erreichbar"; a failed or empty series only empties `history`. `max-age=60`, cached per pair. |
| **Sounding stations and forecast (`/api/meteo/previtemps/*`)** | ICON grid tiles and point data | **Not ported yet** | Several calls and the level maths. | 404 until PR11. |
| **BAZL obstacles (`/api/obstacles`)** | `shv-app-static-prod.ubmeteo.io/v1/obstacles/...` | **Not ported yet** | 122 MB dataset. | 404 until PR12 (upstream vector tiles in the browser, or build-time shards). |
| **Member login (`/api/auth/*`)** | SHV Keycloak | **Dropped** | Reused the official app's client. | 404; PR13 removes the client side and the Profile tab. |

Express and its Python parcel analysis are gone (PR9). The routes nothing called (`/api/health`, `/api/emagram/calculate`, `/api/meteo/previtemps/sounding*`, `/api/obstacles/tiles/*`) were not ported.

## Spike: edge caching and CPU on pages.dev

Pending: the repo owner runs the spike from PR9's description on a branch deploy and records the results here. Until then the code assumes the edge cache works (the plan's default path). If it doesn't, an upstream failure shows the 503 state, and the Foehn badge moves to the browser in PR10 ([target.md](../plan/2026-11-23-astro-cloudflare/target.md)).

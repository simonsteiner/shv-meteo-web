# The official SHV app's network calls, captured

Date: 2026-11-24. App 1.1.0 (version code 1010001), captured with mitmproxy as in [shv-app-traffic-capture.md](../reference/shv-app-traffic-capture.md):

- **Logged out**, API 34 AVD, app data cleared first: onboarding, home screen, live map, 00:31 to 00:35 UTC.
- **Logged in as a member**, API 36 AVD, HTTP caches cleared first, through the redacting addon (no bodies, tokens or cookies kept): every screen by deep link, the live map's three tabs and their layers, a station, a take-off and a Previtemps sounding opened by tapping the blank map, 00:37 to 00:54 UTC.

Sizes are as sent on the wire (gzip where upstream compresses) unless marked decoded. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Summary

- **No pinning, no secrets on the data calls.** A system CA was enough. Weather, map and webcam calls carry no key and no token; only `/v1/wms/person` carries the member's Bearer token. The data calls send no `Origin`.
- **The app filters the station call; we don't.** The live map asks `measurements/current` for six parameters in a box around Switzerland: 536 KB decoded, 1,081 stations (95 KB on the wire). Our `/api/measurements` fetches the unfiltered Alps box: 3.1 MB, 4,177 stations.
- **The map's tiles and layers fire on the emulator** even though nothing is drawn: Ubique's own vector base map and hillshade, swisstopo vector and WMTS tiles, and vector tiles for the BAZL obstacles and four federal environment layers.
- **Unused by us so far:** the federal environment tile sets (floodplains, game reserves, moorland landscapes, wildlife rest areas), the Segelflugkarte, Ubique's vector base map, hillshade and elevation tiles, swisstopo's vector base map, the Swiss and European forecast animations (`animation_overview.json`), the provider and product catalogues, and dew point in the station series. All tile and animation hosts answer CORS `*`.
- **Previtemps at runtime matches the decompiled reading** in [shv-native-app.md](../reference/shv-native-app.md): grid tile, both ICON models' `/runs`, then one call per run and parameter, 30 calls for one sounding.

## Calls by host

User-Agents: `Android/<sdk> ch.shv_fsvl/1010001` (the Ktor client), `ch.shv_fsvl;1.1.0;Android;<sdk>` (map tiles and animation frames), `Android/shv-1.1.0` (config and events), `Heidi/OIDC` (Keycloak), `shv-app;android;Android 36;16` (member service), `sentry.java.android/8.36.0`.

| Host | Call | When | We use it |
| :--- | :--- | :--- | :--- |
| `app-in.ubmeteo.io` | `GET /v1/config?appid=shv&appversion=1.1.0&platform=ANDROID&osversion=<sdk>`, answers `{"enabled":true,"feedbackConfigs":{},"featureConfigs":{}}` | app start | no, nothing to use |
| | `POST /v1/event` (204) | during use | no, usage events |
| `login.shv-fsvl.ch` | `GET /realms/SHV/.well-known/openid-configuration` | start, logged out | dropped (PR13) |
| | `POST /realms/SHV/protocol/openid-connect/token` | start, logged in (refresh) | dropped |
| `shv-app-ws-prod.shv-app.ch` | `GET /v1/wms/person`, Bearer | start, logged in | dropped |
| | `GET /v1/text/forecast/de.json` | text forecast | yes, `/api/meteo/text-forecast/:lang` |
| | `GET /v1/text/isobaren/de.svg` | text forecast | yes, `<img>` |
| `weather-ws-prod.ubmeteo.io` | `GET /v1/data/providers` (1.3 KB), `GET /v1/data/products` | start | no |
| | `GET /v1/measurements/current?minLat=45.7&minLon=5.9&maxLat=47.9&maxLon=10.7&parameters=wind_direction,wind_speed&country=ch&appId=shv` (174 KB decoded, 457 stations) | home screen map, every minute, with `If-Modified-Since` | no, see below |
| | `GET /v1/measurements/current?minLat=45.5&minLon=5.5&maxLat=48.1&maxLon=11.0&parameters=pressure_standard_msl,wind_direction,wind_gust,wind_speed,temperature,temperature_2m&appId=shv` (536 KB decoded) | live map, every minute | partly: `/api/measurements` is unfiltered |
| | `GET /v1/measurements/timeseries/<provider:id>?parameters=` three times: `wind_speed,wind_gust`; `wind_direction`; `temperature,dew_point` (4 to 6 KB each) | a station's sheet | partly: one call, six parameters, no dew point |
| | `GET /v1/point-data/meteo_swiss:icon_ch{1,2}/runs`, then `/<run>/<parameter>/<point>` | Previtemps, after tapping a station | yes, `/api/meteo/previtemps/forecast/:name` |
| `static-prod.ubmeteo.io` | `GET /v1/map/3857/vector/base/{z}/{x}/{y}.pbf`, `GET /v1/map/4326/hillshade/light/{z}/{x}/{y}.png` | every map: home, live map, forecast maps | no |
| | `GET /v1/map/4326/elevation/{z}/{x}/{y}.png`, the same z10 tile as the grid's | Previtemps, after tapping a station | no |
| | `GET /v1/products/grid/10/{x}/{y}.json` | Previtemps | yes, `npm run grid` |
| | `GET /v1/animation/switzerland/animation_overview.json`, then `.../<layer>/<product:run>/<window>/animation.webp` (881 KB per frame strip) | Swiss forecast ("Schweiz") | no |
| | `GET /v1/animation/global/animation_overview.json`, then `.../temperature_500_hpa/<product:run>/<window>/focus_point/<n>.webp` (633 KB) and `.../geo_potential/<product:run>/<window>/animation.geojson` | European forecast ("Europa") | no |
| | `GET /v1/animation/switzerland/days_overview.json`, then `.../precipitation_probability_weak/<product:run>/<time>/animation.webp`, 23 frames | outlooks ("Aussichten") | yes, Outlooks |
| `shv-app-static-prod.ubmeteo.io` | `GET /v1/flyingsites.geojson` | live map | yes, snapshot |
| | `GET /v1/airspaces/shv.geojson`, `GET /v1/wildschutz/shv.geojson` | live map, Luftraum tab | yes, snapshots |
| | `GET /v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf` | "Luftfahrthindernisse" on | no, we build shards (PR12) |
| | `GET /v1/wildschutz/tiles/<set>/{z}/{x}/{y}.pbf`, sets `auengebiete-aulav`, `jagdbanngebiete-aulav`, `moorlandschaften-aulav`, `wildruhezonen` | "Umwelt" layers on | no |
| `vectortiles.geo.admin.ch`, `vectortiles0.geo.admin.ch` | `GET /tiles/ch.swisstopo.{base,relief}.vt/v1.0.0/tiles.json`, then `/{z}/{x}/{y}.pbf` | Luftraum tab ("Light Base Map") | no |
| `wmts.geo.admin.ch` | `GET /1.0.0/ch.bazl.segelflugkarte/default/current/2056/{z}/{x}/{y}.png` | "Segelflugkarte" | no |
| | `GET /1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/2056/{z}/{x}/{y}.jpeg` | "Swisstopo Rasterkarte" | yes, in 3857 |
| | `GET /1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg` | "Luftbildkarte" | yes |
| `webcam-prod.ubmeteo.io` | `GET /v1/webcams/overview?west=5.5&south=45.5&east=11.0&north=48.1` (34 KB decoded, 43 webcams) | Webcams layer on | yes, `/api/webcams` (box 5.9, 45.8, 10.5, 47.8) |
| | `GET /v1/webcams/<provider:id>/image/thumbnail?ts=<ms>`, one per webcam | Webcams layer on | yes, `thumbnailUrl` |
| `sentry.ubique.ch` | `POST /api/64/envelope/` | after the European forecast crashed the app (see the capture guide's gotchas) | no |

A take-off's sheet (description, access, club) made no call: it comes from `flyingsites.geojson`. Turning on "Temperatur" or "Differenzen" made no call either; they read the live map's measurements. The Previtemps station list is in the app, not fetched.

## Details

- **Station call cadence and caching.** `measurements/current` answers `Cache-Control: max-age=1800, s-maxage=60`; the app polls each variant once a minute and sends `If-Modified-Since`, so some answers are 304. The map's variant uses `pressure_standard_msl` where our Föhn station pairs use `pressure_msl` (`src/scripts/foehn/fetch.ts` asks for both and the surface pressure). Both variants send `appId=shv`; only the home map's sends `country=ch`.
- **Previtemps runs.** For Buochs at 00:49 UTC: grid tile `10/535/244`; ICON-CH1 point 793618 over four runs (12Z, 15Z, 18Z and 21Z on 2026-11-23); ICON-CH2 point 197077 over one run (18Z); for each run `temperature`, `pressure`, `wind_u`, `wind_v`, `specific_humidity` and `height_half_level`. Runs answer `max-age=7776000, immutable`, the runs lists `max-age=300`. Our Function makes two calls (runs, then the newest run with all six series in one `?parameters=`).
- **The Swiss animation index** lists 185 sections: precipitation (MeteoSwiss radar, INCA, ICON-CH1 and CH2), temperature, cloud levels, cloud (with DWD satellite), wind, gusts, wind at 100, 400 and 800 m above ground and at 1500, 2000, 2500, 3000 and 4000 m above sea level (`fluid:icon_ch1` and `fluid:icon_ch2`), and 850 hPa temperature (ICON-D2). Only the shown layer's frame strip is fetched, here `wind_1500m_amsl` from the 21Z ICON-CH1 run.
- **The European index** has 60 sections of `dwd:icon_global`: precipitation, gusts, temperature, 850 and 500 hPa temperature, cloud, wind, 850 hPa wind, isobars, geopotential and 850 hPa theta-e (`fluid:icon_global`). Frames are cut per focus point (`focus_point/<n>.webp`), the geopotential comes as GeoJSON.
- **Tiles at null island.** The first map after the app starts asks for `10/511/511` to `10/512/512` of the vector base map and hillshade, around 0°, 0°, before its camera moves to Switzerland.
- **404s are holes, not errors.** The obstacle and environment tile sets answered 404 (an HTML page) for z6 tiles beside Switzerland (`6/32/21`, `6/33/23` and so on).

## CORS for the unused calls

Checked with `curl`, User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)` and `Origin: https://example.org`, at 00:56 UTC:

- **CORS `*`:** `static-prod.ubmeteo.io` vector base, hillshade and elevation tiles, both `animation_overview.json` and their frames; `shv-app-static-prod.ubmeteo.io/v1/wildschutz/tiles/...`; `vectortiles.geo.admin.ch`; `wmts.geo.admin.ch` Segelflugkarte, also in the 3857 grid (`.../segelflugkarte/default/current/3857/9/267/180.png`, 200).
- **403 to an `Origin`:** `weather-ws-prod.ubmeteo.io/v1/data/providers`, `/v1/data/products` and `timeseries?parameters=` (as for the other weather calls), and `webcam-prod.ubmeteo.io/.../image/thumbnail`. An `<img>` sends no `Origin`, which is why our webcam cards load the thumbnails.

## Not captured

- **The webcam detail.** Taps on the map while the Webcams layer was on hit the bottom sheet, not a webcam.
- **The other forecast layers and times.** On the Swiss and European screens only the first frame strip loaded; switching layers there loaded nothing more, likely because the stalled renderer never asks. The north-south screen made no call of its own (it opened right after the app restarted from that crash).
- **The text forecast in French and Italian.** The AVDs run in German; the app asks for `de.json` only.

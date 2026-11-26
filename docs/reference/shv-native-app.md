# SHV FSVL native app: reverse-engineered reference

How the official SHV FSVL Android app (`ch.shv_fsvl`) and its backends work, as found by decompiling the APK (`jadx`), extracting its assets and capturing its network calls. This web app is built against the same upstream services; for how our code uses them, see [../architecture.md](../architecture.md). The decompiled APK and its unpacked assets (`apk_analysis/`) are gitignored and not part of this repo. To run the app yourself, see [shv-app-emulator.md](shv-app-emulator.md); every call it made in a capture on 2026-11-24 is listed in [the research note](../research/2026-11-24-shv-app-network-calls.md).

Member login (Keycloak) and the member web service are in [shv-native-auth.md](shv-native-auth.md). This site has no login.

## Who runs what

- **SHV FSVL** (the federation): the member registry, licences (Brevets), the collective liability insurance and the Keycloak realm on `login.shv-fsvl.ch`.
- **Ubique Innovation AG** (Zurich): builds the app and runs its backends, the `*.ubmeteo.io` hosts (Fluid Meteo SDK) and `shv-app-ws-prod.shv-app.ch`.
- **Federal sources**, passed on through those backends or loaded directly: swisstopo maps (GeoAdmin WMTS and vector tiles), BAZL airspace, obstacles and the glider chart, BAFU wildlife reserves, MeteoSwiss ICON models and stations.

## Hosts

What the app calls on each host, from the 2026-11-24 capture (app 1.1.0), and where this site uses it. The research note has every call with its parameters, sizes and cadence.

| Host | Operator | What the app calls | We use it |
| :--- | :--- | :--- | :--- |
| `login.shv-fsvl.ch` | SHV FSVL | OIDC discovery and token refresh | no, login dropped (PR13) |
| `shv-app-ws-prod.shv-app.ch` | Ubique for SHV | `/v1/wms/person` (Bearer); `/v1/text/forecast/{lang}.json`; `/v1/text/isobaren/{lang}.svg` | text forecast through `/api/meteo/text-forecast/:lang`, isobars as an `<img>`; member data no |
| `weather-ws-prod.ubmeteo.io` | Ubique | `/v1/measurements/current` and `/timeseries/<id>`; `/v1/point-data/<model>/...` (Previtemps); provider and product catalogues | `/api/measurements`, `/api/measurements/timeseries/:id`, `/api/foehn`, `/api/meteo/previtemps/forecast/:name`; the catalogues no |
| `webcam-prod.ubmeteo.io` | Ubique | `/v1/webcams/overview`, thumbnails | `/api/webcams`, thumbnails direct |
| `static-prod.ubmeteo.io` | Ubique | vector base map, hillshade and elevation tiles; `/v1/products/grid/...` (Previtemps grid); Swiss and European forecast animations; outlook frames | outlooks direct; the grid at build time (`npm run grid`); the map tiles and the Swiss and European animations no |
| `shv-app-static-prod.ubmeteo.io` | Ubique | flying sites, airspaces and wildlife reserves as GeoJSON; obstacle and environment vector tiles | GeoJSON read live by the browser; obstacles built from `/v1/obstacles/bazl.geojson` into our own shards (`npm run obstacles`, PR12); the vector tiles no |
| `wmts.geo.admin.ch`, `vectortiles*.geo.admin.ch` | swisstopo | raster maps, aerial images, the glider chart; vector base map | raster maps, aerial images and the glider chart direct; the vector tiles no |
| `app-in.ubmeteo.io`, `sentry.ubique.ch` | Ubique | app config, usage events, crash reports | no |

## Android app

### Code layout

- `ch.shv_fsvl.feature.*`: the app's screens; the account feature is described in [shv-native-auth.md](shv-native-auth.md#account-classes-in-the-apk).
- `ch.ubique.heidi.oidc.*`: Ubique's OpenID Connect library, used only for member login.
- `ch.ubique.fluidsdk.*`: weather time series, the raster and vector map engines, weather station products and telemetry.

### Frameworks

- **UI**: Jetpack Compose with Material 3 Adaptive layouts.
- **Dependency injection**: Koin (`org.koin.core`).
- **HTTP**: Ktor Client (`io.ktor.client`) with JSON serialization plugins.
- **Serialization**: `kotlinx.serialization` with custom polymorphic serializers.
- **Error reporting**: Sentry Android SDK (`sentry.ubique.ch`).

## Forecast sounding (Previtemps), version 1.1.0

Checked on 2026-11-23 against 1.1.0 (version code 1010001), decompiled with jadx; class names are obfuscated and change between builds. The 2026-11-24 capture confirmed it at runtime.

- **Calls, all anonymous** (the OIDC Bearer plugin is installed only on the member-service client): `GET https://weather-ws-prod.ubmeteo.io/v1/point-data/<model>/runs`, `GET https://static-prod.ubmeteo.io/v1/products/grid/10/<x>/<y>.json` for the grid points, then `GET https://weather-ws-prod.ubmeteo.io/v1/point-data/<model>/<run>/<parameter>/<pointIndex>` per run and parameter.
- **Models it knows:** `meteo_swiss:icon_ch1`, `meteo_swiss:icon_ch2`, `dwd:icon_d2`, `dwd:icon_eu`, `dwd:icon_global`.
- **Point:** the nearest grid point of the tile's definition for the model, used only within 20 km.
- **Runs:** every listed run from the last one starting before the shown window up to its end, newest first; a run counts only when every parameter is present, else the screen shows "No complete emagram data available". There is no fallback source.

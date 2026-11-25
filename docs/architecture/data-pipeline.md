# Spatial and weather data

What the upstream data holds and how the app reads it. Which upstream each resource comes from, and whether the browser calls it directly or through a Function, is the table in [data-queries.md](data-queries.md). Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Static GIS snapshots

`public/data/` holds snapshots of the SHV CDN datasets (`shv-app-static-prod.ubmeteo.io`); `ShvApi` loads them first and falls back to the CDN ([src/scripts/api.ts](../../src/scripts/api.ts)). Counts as of the current snapshots:

- `flyingsites.geojson`: 1,341 features (358 take-offs, 199 landings, 111 landing circuits, and the auxiliary areas below).
- `airspaces.geojson`: 353 airspaces.
- `wildschutz.geojson`: 51 wildlife reserves.
- `previtemps_stations.json`: the 107 sounding stations.

## Flying sites

- **Pins**: only `type` `launch` (take-off) and `landing` get a marker ([src/scripts/maps/sites.ts](../../src/scripts/maps/sites.ts), `visibleSites`), filtered by the search and, for take-offs, the wind compass. Landing circuits (`landingpattern`) are drawn as lines with a popup ([src/scripts/maps/layer-sites.ts](../../src/scripts/maps/layer-sites.ts)). The other types (`launcharea`, `landingarea`, `access`, `parking`, `packingarea`, `obstacle`, `attention`, `restrictedarea`, `roadclosed`) are not drawn.
- **Site names**: features link to their flying site by `siteId`. A feature without a `siteName` takes its site's from `siteNames()`, else its `description`, else a generic "Startplatz" or "Landeplatz" ([src/scripts/sheet/site.ts](../../src/scripts/sheet/site.ts)).
- **Geometry**: many features are `Polygon`, `MultiPolygon` or `LineString`, not `Point`; positions come from `featureLatLng()` ([src/scripts/maps/centroid.ts](../../src/scripts/maps/centroid.ts)).
- **Site fees**: `fees` (text), `feePaymentLink` (a payment button) and `feeQrCodeUrl` (a QR code image), shown in the site's sheet.
- **Badges**: what the site suits (`paraglider`, `hangglider`, `speedflyer`, `toplanding`, `soaring`, `crossCountry`, `hikeAndFly`, `groundhandling`), how to reach it (`accessibleByCar`, `publicTransport`), `difficulty` (`easy`, `moderate`, `difficult`) and `openingStatus` (only `closed` occurs).

## Station pairs

The four pairs of the official app (its `PressureDifferenceGeoJsonTransformer`), in [src/scripts/foehn/pairs.ts](../../src/scripts/foehn/pairs.ts); the alert levels are in `assess()` in [src/scripts/foehn/report.ts](../../src/scripts/foehn/report.ts). A pressure pair reads both stations' QNH (`pressure_standard_msl`, `pressureStandardMslValue`), as the official app does (APK `ch/shv_fsvl/feature/livemap/d.java`, `e.java`), for its current difference and its 24-hour history alike. No other pressure stands in: a pair with one station's QNH missing has no difference and shows "no data" (`NO_DATA`), never calm and never an alert.

1. **Gotthard (`KLO_LUG`)**, `PRESSURE_NORTH_SOUTH`: Lugano minus Zürich/Kloten (`meteo_swiss:LUG`, `meteo_swiss:KLO`), QNH in hPa. +4 hPa or more is moderate south föhn, +8 severe; -4 or less moderate north föhn, -8 severe.
2. **East-west (`GVE_GUT`)**, `PRESSURE_EAST_WEST`: Geneva minus Güttingen (`meteo_swiss:GVE`, `meteo_swiss:GUT`), the bise indicator.
3. **Alpine crest temperature (`PIL_MTR`)**, `TEMPERATURE_NORTH_SOUTH`: Pilatus minus Matro (`meteo_swiss:PIL`, `meteo_swiss:MTR`) in °C, for stability across the ridge. It raises no alert.
4. **Jura (`DEM_GRE`)**, `PRESSURE_NORTH_SOUTH`: Grenchen minus Delémont (`meteo_swiss:GRE`, `meteo_swiss:DEM`) in hPa.

For the two other pressure pairs a difference of 3 hPa either way is moderate and 6 hPa a danger. These thresholds (4/8 and 3/6 hPa) are this app's own, carried over from the old Express server: neither audit found the official app's thresholds in its decompiled code. An unknown `?pair=` gets `KLO_LUG`.

## Measurement units

Ubique's weather service (`weather-ws-prod.ubmeteo.io`) uses these units, as the official app's map style reads them:

- **Wind and gusts** (`windSpeedValue`, `windGustValue`): already km/h. Never multiply by 3.6 (Uetliberg's 40.3 km/h would show as 145).
- **Temperatures** (`temperatureValue`, `temperature2mValue`, `dewPointValue`, `dewPoint2mValue`): a value above 200 is Kelvin.
- **Pressure** (`pressureMslValue`, `pressureStandardMslValue`, `pressureSurfaceValue`): hPa, except that a value above 20,000 is in pascals. On 2026-11-25 the 258 Holfuy and Mistral stations sent `pressureSurfaceValue` in pascals (Pallanza 98730) and no station sent tenths of hPa. 83 of the 258 sent a pressure no station can measure (82 Mistral stations 163820 Pa, Holfuy's Bälmeten at 2414 m 137000 Pa), so a pressure outside 300 to 1100 hPa counts as missing. `toHpa` in [units.ts](../../src/scripts/units.ts) converts.
- **Which pressure shows** ([src/scripts/pressure.ts](../../src/scripts/pressure.ts), the same on the weather page's card and dialog and the map's sheet): QNH from `pressureStandardMslValue`, else QFF from `pressureMslValue` labelled QFF (the 83 DWD and Météo-France stations send only that), and beside it QFE from `pressureSurfaceValue`. Holfuy's `pressureSurfaceValue` reads 1005 to 1023 hPa at every altitude, a sea-level value under the surface name, so it is not shown as QFE; 111 GeoSphere stations above about 1300 m send 798 to 866 hPa as `pressureStandardMslValue`, so a sea-level value under 900 hPa is not shown.

The Functions pass the bodies through unparsed; the browser converts through `toCelsius` and `toHpa` in [src/scripts/units.ts](../../src/scripts/units.ts), on the weather page in [src/scripts/weather/stations.ts](../../src/scripts/weather/stations.ts) and on the map in [src/scripts/maps/stations.ts](../../src/scripts/maps/stations.ts).

## Map controls

The meteo modes are the official app's `LiveMapMeteoType`: `WIND`, `TEMPERATURE`, `PRESSURE_DIFFERENCE` (the station pairs), `WEBCAM` and `NONE` (`METEO_MODES` in [src/scripts/settings.ts](../../src/scripts/settings.ts)). The layers drawer has three tabs, `METEO`, `AIRSPACE` and `FLYING_AREAS`; which layer switches, base maps and the wind compass each tab shows is `DRAWER_PANES` in [src/scripts/maps/drawer.ts](../../src/scripts/maps/drawer.ts). On a first visit only the stations layer is on (`defaultSettings()`).

Base maps ([src/scripts/maps/basemap.ts](../../src/scripts/maps/basemap.ts)): swisstopo `pixelkarte-grau` (`topoLight`, the default), `pixelkarte-farbe` (`topoColor`), `swissimage` (`topoSatellite`), OpenStreetMap (`topoOsm`) and BAZL's glider chart (`gliderChart`, `ch.bazl.segelflugkarte`). While the airspace tab is open, a floating link opens the Skybriefing DABS. The info button opens the airspace legend and the data sources; each legend swatch is drawn at build time from the map's own style for that type (`AIRSPACE_LEGEND` in [src/scripts/maps/legend.ts](../../src/scripts/maps/legend.ts)), so the two can't drift apart.

## Text forecasts

`/api/meteo/text-forecast/:lang` passes `shv-app-ws-prod.shv-app.ch/v1/text/forecast/{lang}.json` through; [src/scripts/forecast/text.ts](../../src/scripts/forecast/text.ts) reads it:

- **Regional** (`forecast`): keys `0` (Deutschschweiz and Graubünden), `1` (Alpensüdseite and Engadin), `2` (Westschweiz and Wallis).
- **Paragliding** (`gleitschirmForecast`, else `flugwetterForecast`), **soaring** (`segelflugForecast`) and the **general situation** (`generalForecast`).

The isobar chart is upstream's SVG (`v1/text/isobaren/{lang}.svg` on the same host) in an `<img>`.

## Outlooks

`static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json` lists the frames of three products: `RELATIVE_SUNSHINE`, `PRECIPITATION_PROBABILITY_WEAK` and `PRECIPITATION_PROBABILITY_STRONG`. The frames are greyscale WebP rasters whose green channel holds a percentage; [src/scripts/forecast/outlooks.ts](../../src/scripts/forecast/outlooks.ts) colours them through the official app's palettes in a canvas, laid over a swisstopo map with a player ([outlooks-page.ts](../../src/scripts/forecast/outlooks-page.ts)).

## Soundings

- **Grid points**: `npm run grid` ([scripts/previtemps-grid.ts](../../scripts/previtemps-grid.ts)) maps each sounding station to its nearest ICON-CH1 grid point, else ICON-CH2, from upstream's zoom-10 grid tiles (`static-prod.ubmeteo.io/v1/products/grid/10/{x}/{y}.json`, with `x = floor((180 + lon) / 0.3515625)` and `y = floor((90 - lat) / 0.17578125)`, [src/scripts/emagram/gridpoint.ts](../../src/scripts/emagram/gridpoint.ts)), and writes `src/data/previtemps_grid.json`.
- **Point data**: the Function asks the grid point's model for its runs and tries the newest two; each run's six series (`temperature`, `pressure`, `specific_humidity`, `height_half_level`, `wind_u`, `wind_v`) come in one call ([src/scripts/emagram/fetch.ts](../../src/scripts/emagram/fetch.ts)).
- **Levels**: the browser builds them from the ground up to 550 hPa ([src/scripts/emagram/levels.ts](../../src/scripts/emagram/levels.ts)): each of the 80 full levels sits in the middle of its layer, the mean of its two boundaries among the 81 `height_half_level` values (22 km down to the ground), as the official app computes it (APK `ex7.java`); Interlaken's lowest level is at 586 m, between the ground at 576 m and the layer's top at 596 m; dew point by Magnus-Tetens from the vapour pressure `e = q p / (0.622 + 0.378 q)`, wind speed in km/h and direction from `u` and `v`, and the lapse rate in °C per 100 m.
- **Chart** ([src/scripts/forecast/emagram.ts](../../src/scripts/forecast/emagram.ts)): temperature and dashed dew point over log pressure from 1000 to 600 hPa, the temperature coloured by lapse rate (`lapseColor`: yellow from 0 up, inversion; light green to -0.3; green to -0.6; blue to -0.8; red to -1; purple below, superadiabatic), a wind column from 0 to 45 km/h, and a time ruler with a player ([emagram-card.ts](../../src/scripts/forecast/emagram-card.ts)). The station picker is a Leaflet map on swisstopo `pixelkarte-farbe` ([emagram-page.ts](../../src/scripts/forecast/emagram-page.ts)).

## BAZL obstacles

- **Source**: `shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson`, about 128 MB, cut into static shards at build time by `npm run obstacles` ([scripts/obstacles.ts](../../scripts/obstacles.ts)); how the browser loads them is the "BAZL obstacles" row in [data-queries.md](data-queries.md). Upstream's MVT tiles were tried and not used (the spike in data-queries.md and [the research note](../research/2026-11-24-obstacle-vector-tiles.md)).
- **Level of detail** (`visibleAt` in [src/scripts/obstacles/lod.ts](../../src/scripts/obstacles/lod.ts)): nothing below z7; areas always; up to z11 a line or point needs a marking (any of BAZL's `MARKED`, `CABLE_WARNER`, `ORANGE_MARKS` and `RED_WHITE_RED`; `isMarked` in [marking.ts](../../src/scripts/obstacles/marking.ts)) or a height above a threshold that drops as the zoom rises; cable pylon points only from z13. The map draws obstacles from z8 (`OBSTACLE_MIN_ZOOM`).
- **Look** ([src/scripts/maps/obstacles.ts](../../src/scripts/maps/obstacles.ts)): power lines blue, red when marked; other lines red; areas red, orange around an airport. Cable ends are always circles; other points are coloured circles below z13 and the BAZL symbols (`public/assets/obstacles/<styleId>.svg`) from z13.
- **Sheet** ([src/scripts/sheet/obstacle.ts](../../src/scripts/sheet/obstacle.ts)): the type in the UI language (upstream's code when unknown), height above ground and top elevation, the aerodrome when there is one, marking, lighting, the BAZL id, the date the record took effect (`effectiveDate`, hidden when it is upstream's placeholder `1950-01-01`, on about 2,800 of 225,000), directions and the DABS link. The shards keep only these properties (`slim()` in `lod.ts`); the date adds 5.6% to them, 2.5% gzipped.

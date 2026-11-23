# Soundings and Foehn: CPU, the point-data outage and other sources

Date: 2026-11-23. Live checks ran between 12:58 and 13:03 UTC with `curl` (User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`) unless a line says otherwise. Terms follow [GLOSSARY.md](../../GLOSSARY.md): station pair, sounding station, sounding.

## Summary

- `/api/foehn` spent 8 to 29 ms CPU (Free limit 10 ms), mostly parsing 0.98 MB: the Swiss measurements (0.82 MB) and two 14-day series. Asking upstream only for what the report reads (`parameters=` and a box per parameter, `start=` 25 hours back on the series) cuts the payload to about 52 KB and the CPU to a median of 5.5 ms (3 to 13 ms), with identical output; no upstream change needed.
- Upstream's sounding point data was still down at 12:58 UTC: `/runs` lists runs, every uncached point answers 404. Our Function's 503 is correct; there is no other SHV-side source.
- The official app 1.1.0 makes the same anonymous calls, so it fails too; a member login would change nothing.
- MeteoSwiss Open Government Data has ICON-CH1/CH2 (CC BY 4.0, 09Z run published 10:23 UTC), but only as whole-domain GRIB2 (about 184 MB per variable and lead time), kept 24 hours. Own soundings from it need a build pipeline outside Pages.
- xcbenz.com publishes ready emagram bundles (09Z ICON-CH1, CORS `*`) per region, but has no terms or license: not something to depend on.
- Open-Meteo serves `meteoswiss_icon_ch1`/`_ch2` without pressure levels (all `null`); DWD `icon_d2` through Open-Meteo has 19 pressure levels, CORS `*`, and the free non-commercial tier fits this site, at 8.4 API calls per full sounding request.
- Open-Meteo has no observations: its `current` values are model output, so it cannot replace the measured station pairs behind the Foehn badge.

## Foehn CPU

**Spike and real route (recorded, not re-run today).** From [data-queries.md, "Spike: edge caching and CPU on pages.dev"](../architecture/data-queries.md): on branch previews of Pages project `shv-meteo`, `caches.default` kept copies on `pages.dev` (miss, then hit 46 s and 2 min 17 s later). Pages passes `/api/_spike/Disentis%2FMust%C3%A9r` as one undecoded segment `["Disentis%2FMust%C3%A9r"]`. The spike CPU route (Swiss-bbox measurements, 816 KB, plus two six-parameter series of about 460 KB each) took p50 10.6 ms, p90 14.9 ms, p99 21.4 ms over 28 requests (GraphQL analytics `pagesFunctionsInvocationsAdaptiveGroups`, `cpuTime` quantiles in microseconds). The real `/api/foehn`, freshly computed, took 8 to 29 ms (median 16.5 ms, 12 requests, `wrangler pages deployment tail`); a cache hit about 1 ms; one fresh sounding (Disentis/Mustér) 13 ms. The Free plan allows 10 ms CPU per request; every request still succeeded. `Date.now()` stands still during compute in Workers, so timing inside the Function reads 0.

**Cause.** At HEAD (`07b7e5d`), `src/scripts/foehn/fetch.ts:12` fetches `https://weather-ws-prod.ubmeteo.io/v1/measurements/current?minLat=45.8&minLon=5.9&maxLat=47.8&maxLon=10.5` and `report.ts:204` reads only the eight pair stations (KLO, LUG, GVE, GUT, PIL, MTR, DEM, GRE) from it. Re-measured: 818,708 bytes, 932 features.

**Fix (fix/foehn-cpu, measured 14:10 to 14:14 UTC).** Upstream's own query parameters, the ones the official app sends (decompiled 1.1.0, `defpackage/aw6.java:1141-1152`: `minLat`, `minLon`, `maxLat`, `maxLon`, `parameters` on `measurements/current`), are enough; nothing upstream has to change.

- `parameters=pressure_msl` over the box spanning the six pressure stations: 19,903 B, 67 stations (all six present); `parameters=temperature` over the box spanning Pilatus and Matro: 20,246 B, 68 stations. Unfiltered, the Swiss bbox is 805,992 B.
- A series without `start` holds 14 days of 10-minute values (2,012 points, 76,392 B for KLO `pressure_msl`); with `start=<now minus 25 h>` it holds 149 points, 5,776 B. The history uses the last 24 hours (`pairHistory`, `pairs.ts`).
- First tried: a ±0.01° to 0.02° box per station (eight calls, about 16 KB). Median CPU 10.5 ms (7 to 20 ms over 12 reports): the per-call cost of ten upstream calls outweighed the smaller payload. A plain one-call proxy miss costs 1 to 3 ms on the same preview.
- Final: two filtered measurements calls and two 25-hour series (four calls, about 52 KB): 3 to 13 ms over 16 fresh reports, median 5.5 ms, 15 of 16 under 10 ms (the 13 ms one was the first request, likely a cold start). Wall time 72 to 234 ms, against 129 to 475 ms before. The four pairs' differences and the 143-point history matched the old route's output.

## SHV point-data outage

What failed (recorded in data-queries.md): from some time after 09:31 UTC, `https://weather-ws-prod.ubmeteo.io/v1/point-data/<model>/runs` listed one run per model, but every `/v1/point-data/<model>/<run>/<parameter>/<pointIndex>` answered 404 `application/problem+json` "<model>:TEMPERATURE:<run> not available" (`icon_ch2`: "No readable data available"), also for the eight earlier runs and any User-Agent. Six stations answered 200 only from Cloudflare's cache (`cf-cache-status: HIT`, `Cache-Control: max-age=7776000, immutable`, last modified 09:31 UTC). `npm run grid` regenerated identical grid points. Legacy Express made the same six calls (`git show e1e5525:server/emagram_provider.js`, lines 92 to 110), as does `src/scripts/emagram/fetch.ts:34-47` with the parameters of `levels.ts:28-35`.

Re-checked 2026-11-23T12:58Z:

- `/runs`: `meteo_swiss:icon_ch1` and `icon_ch2` `[1795413600000]` (06Z), `dwd:icon_d2` and `icon_eu` `[1795424400000]` (09Z), `dwd:icon_global` 06Z.
- Interlaken, ICON-CH1 06Z, point 776549, `temperature?nc=<random>`: 404, `cf-cache-status: BYPASS`, `{"detail":"meteo_swiss:icon_ch1:TEMPERATURE:2026-11-23T06:00:00Z not available"}`. **Still down.**
- The same URL without a query string: 200 from cache (`HIT`, last modified 09:31:38 GMT), 80 levels, 34 time steps, one ensemble member.
- With an `Origin` header, `/runs` and point data answer 403, so the browser cannot call point data directly (matches data-queries.md).

## Official app's sounding calls

Source: SHV FSVL Android app `ch.shv_fsvl` 1.1.0 (version code 1010001), downloaded from APKPure (an unofficial mirror) with `apkeep`, decompiled with jadx 1.5.7, analysed statically only, never run. Class names are obfuscated. Re-checked today:

- decompiled 1.1.0, `defpackage/aw6.java:1087`: path `v1/point-data/<model>/<run>/<variable>/<pointIndex>`; `:1090`: `v1/point-data/<model>/runs`; `:1095`: `v1/products/grid/10/<x>/<y>.json` (static-prod).
- decompiled 1.1.0, `defpackage/sl2.java:134`: a grid point counts only if `d < 20.0` (km), the nearest one wins. Requesting every listed run in the shown window, newest first, was read earlier and not re-read today.
- decompiled 1.1.0, `defpackage/in1.java:233`: `"No complete emagram data available"` when no run has every variable.
- decompiled 1.1.0, `ch/ubique/fluidsdk/meteo/common/models/ForecastModel.java:5-16`: `meteo_swiss:icon_ch1`, `meteo_swiss:icon_ch2`, `dwd:icon_d2`, `dwd:icon_eu`, `dwd:icon_global`, plus `fluid:icon_ch1` and `fluid:icon_ch2`; `/v1/point-data/fluid:icon_ch1/runs` (and `ch2`) answered 404 "No such element" today.
- decompiled 1.1.0, `defpackage/pz4.java` is the OIDC plugin (`ch.ubique.heidi.oidc...OidcAuthKt`, `Authorization: Bearer` at line 291); per [shv-native-app.md](../reference/shv-native-app.md) it is installed only on the member-service client. Weather calls are anonymous, so a member login would not bring soundings back.

## xcbenz

xcbenz.com is a third-party pilot weather site without login or paywall. Re-fetched 12:59 UTC:

- `https://data.xcbenz.com/web_exports/manifest.compact.json` (100,126 B, generated 11:09 UTC): `icon-ch1` latest run `20261123_0900` (runs 09Z, 06Z, 03Z, and 03Z of the 22nd), `icon-ch2` latest `20261123_0600`; 592 locations, all of type `region`.
- `.../emagrams/icon-ch1/20261123_0900/oberwallis/bundle.json`: 200, 6,459 B, `access-control-allow-origin: *`, `cache-control: public, max-age=86400`, `schema_version` 2, `product` `emagram_bundle`, `source` `direct-grib-chunks:H000_H016,H017_H033`, 34 steps x 80 levels, variables `p, t, qv, u, v` as float32 little-endian in `profiles.bin` (54,400 B, measured earlier today).
- Coverage is per xcbenz region (`location_id`, for example `oberwallis` at Visp), not per sounding station.
- No license or terms in the manifest, the home page (a single-page app that answers every path with the same HTML) or its loader script. It had ICON-CH1 09Z while SHV's upstream listed only 06Z. With no terms and no stated contract, it is not a source we should depend on.

## MeteoSwiss open data

Checked 13:00 UTC on `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-forecasting-icon-ch1` and `-icon-ch2`:

- ICON-CH1-EPS: 1 km, 33 h, "updated every 3 hours, available for the last 24 hours", license `CC-BY`, updated 12:13Z. ICON-CH2-EPS: 2.1 km, 120 h, every 6 hours, also 24 hours.
- Items are one GRIB2 file per run, lead time, variable and control/perturbed, signed links on `rgw.cscs.ch`. A STAC search (`POST /api/stac/v1/search` with `forecast:variable` `T`, `forecast:perturbed` false, `forecast:horizon` `P0DT02H00M00S`) listed eight CH1 runs, the 09Z one created 10:23:21Z.
- `params_icon-ch1-eps.csv`: `T`, `P`, `QV`, `U`, `V` are "Multi Level" on `HFL` (model levels); `HHL` is a constant; no pressure-level variables. The docs say 80 full levels, native icosahedral grid, GRIB files without coordinates (they come from `horizontal_constants`/`vertical_constants` files), 24-hour window ([opendatadocs NWP page](https://opendatadocs.meteoswiss.ch/e-forecast-data/e2-e3-numerical-weather-forecasting-model)).
- Size: the 09Z `T` control file for one lead time is 183,692,720 B (`Range: bytes=0-15` gave `content-range: .../183692720`, starts `GRIB`); the perturbed one is 1,836,927,200 B. No CORS header.
- Terms: reuse is free, "even commercially", with the source acknowledged ("Source: MeteoSwiss"), under CC BY 4.0 ([terms of use](https://opendatadocs.meteoswiss.ch/general/terms-of-use)).

**Own soundings from it.** One ICON-CH1 run is 5 variables x 34 lead times of about 184 MB each (about 31 GB of control-run downloads per run, by the file size above; byte ranges could cut this to the levels needed if per-level GRIB messages are indexed, not tested). It needs ecCodes or MeteoSwiss's `meteodata-lab`, the native-grid lookup for our 107 stations, a job every 3 hours within the 24-hour window, and storage for the result (for example JSON per station on R2 or in the Pages build). Pages Functions cannot do this; it is a scheduled job of the kind `deploy.yml` runs for obstacles, but heavier and eight times a day.

## Open-Meteo

Sources: [MeteoSwiss API page](https://open-meteo.com/en/docs/meteoswiss-api), [DWD API page](https://open-meteo.com/en/docs/dwd-api), [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing), the [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo) repo and live calls at 13:01 to 13:03 UTC.

**MeteoSwiss models.** Model ids `meteoswiss_icon_ch1`, `meteoswiss_icon_ch2`, `meteoswiss_icon_seamless`. The page says "Pressure-level and height-level data is not yet integrated", and `Sources/App/MeteoSwiss/MeteoSwissDownload.swift` lists "TODO: atmospheric levels integration" (latest commit on that folder `d36d802`, 2026-11-02); the pressure-variable struct exists but its `gribName` is `fatalError()`. Live: `temperature_850hPa`, `relative_humidity_850hPa`, `dew_point_850hPa` for Interlaken (46.686, 7.863) with each of the three ids returned `null` for every hour. Freshness (`/data/meteoswiss_icon_ch1/static/meta.json`): last run 09Z, available 10:53Z; ICON-CH2 06Z, available 08:57Z. No model-level data.

**DWD ICON-D2 (`icon_d2`, 0.02°, about 2 km, 48 h, every 3 hours).** Pressure levels 1000 to 30 hPa on the DWD page (temperature, dew point, relative humidity, cloud cover, wind speed and direction, geopotential height). Request: 6 variables x 14 levels (1000 to 200 hPa), 2 days, `models=icon_d2`: 200, 25,712 B (7,905 B gzip), 71 ms, `X-RateLimit-Cost: 8.4`, 48 hourly steps, none null, grid point 46.681, 7.846, elevation 566 m. Last run 09Z, available 10:25Z (`meta.json`). Trimmed, 2026-11-23T12:00 UTC:

| hPa | height m | T °C | Td °C | RH % | wind km/h | dir ° |
|---|---|---|---|---|---|---|
| 1000 | 167 | 9.0 | 5.6 | 79 | 3.7 | 79 |
| 925 | 808 | 4.8 | 1.9 | 82 | 2.4 | 245 |
| 850 | 1493 | 0.5 | -1.9 | 84 | 20.2 | 252 |
| 700 | 3018 | -9.7 | -9.7 | 100 | 41.1 | 281 |
| 600 | 4190 | -17.3 | -17.3 | 100 | 48.1 | 288 |
| 500 | 5537 | -24.7 | -28.6 | 70 | 71.3 | 306 |

1000 to 950 hPa lie below the 566 m ground (heights 167 to 589 m) and are extrapolated; a sounding would drop them.

**Browser.** `access-control-allow-origin: *` on GET and the OPTIONS preflight, and the rate-limit headers are exposed, so the browser can call it directly.

**Terms.** Free API: non-commercial only, "less than 10'000 API calls per day, 5'000 per hour and 600 per minute", CC BY 4.0 attribution ([terms](https://open-meteo.com/en/terms)); 300,000 per month, not yet enforced ([pricing](https://open-meteo.com/en/pricing)). Non-commercial includes "private or non-profit websites or apps that do not have subscriptions or advertising"; donations are allowed. A request over 10 variables counts fractionally (84 variables cost 8.4). This site has no ads or subscriptions, so it fits. Limits apply per caller IP, and the terms say "we apply limits per Cloudflare user" for Workers. Through a Function, 107 stations x 8 runs a day x 8.4 is about 7,190 calls a day, below 10,000; from the browser, each visitor's IP has its own budget. Commercial use needs a paid key on `customer-api.open-meteo.com`.

**Foehn.** Open-Meteo has forecast, historical-model and other model APIs; its `current` block is "based on 1 hourly weather model data" (MeteoSwiss API page). It has no station observations, so it cannot replace the measured station pairs. One sample: measured `pressureMslValue` at 12:50Z was KLO 1022.8, LUG 1014.7 hPa (difference 8.1); `meteoswiss_icon_ch1` `current` at 13:00Z gave 1022.7 and 1014.5 (8.2). One sample says nothing about accuracy in a föhn event; a modelled difference would be a forecast, labelled as such, not a measurement.

**Against SHV point data.** We would lose the official app's grid point (ICON-CH1, 1 km, the same point the app shows) and its 80 model levels (`levels.ts` keeps those up to 550 hPa, many below 850 hPa); we would gain an independent, documented, browser-callable service, but only on 6 to 14 pressure levels from DWD's 2 km model, which smooths Alpine valleys more than ICON-CH1.

## Options for soundings

| Source | Freshness on 2026-11-23 | Our 107 stations | Browser-callable | Terms | Effort |
|---|---|---|---|---|---|
| SHV upstream point data | down since about 09:31 UTC; listed CH1 06Z | all, exact app grid point | no (403 with `Origin`) | none published; the official app's backend | none (current code) |
| xcbenz bundles | CH1 09Z | nearest of 592 regions | yes (CORS `*`) | none found | small; dependency risk |
| MeteoSwiss OGD GRIB2 | CH1 09Z at 10:23 UTC | all | no | CC BY 4.0, attribution | high: GRIB pipeline, 3-hourly job, storage |
| Open-Meteo `meteoswiss_icon_ch1` | 09Z at 10:53 UTC | all, but no levels | yes | free non-commercial, CC BY 4.0 | blocked until levels exist |
| Open-Meteo `icon_d2` | 09Z at 10:25 UTC | all | yes (CORS `*`) | free non-commercial, CC BY 4.0 | low to medium: new parser, pressure levels |

## Open questions

- When does upstream point data come back, and is ICON-CH1 normally one run behind MeteoSwiss's own publication (06Z listed while 09Z was public)? One observation only.
- When will Open-Meteo add MeteoSwiss pressure levels (the downloader's TODO)?
- How do `icon_d2` pressure-level soundings compare with ICON-CH1 model levels over Alpine valleys for thermal forecasts?
- Could MeteoSwiss's measured SwissMetNet open data (`ch.meteoschweiz.ogd-smn`, 158 stations, CC BY) feed the Foehn badge instead of Ubique? Not evaluated.
- Would xcbenz state terms or a license if asked?

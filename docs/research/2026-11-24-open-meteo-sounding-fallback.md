# Open-Meteo ICON-D2 as a sounding fallback

Date: 2026-11-24. Live calls ran from 20:28 to 20:40 UTC with `curl` and Python's `urllib` (User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`, no key). Terms follow [GLOSSARY.md](../../GLOSSARY.md): a sounding is the data, the emagram is the chart. The earlier look at Open-Meteo is in [2026-11-23-soundings-and-foehn-sources.md](2026-11-23-soundings-and-foehn-sources.md#open-meteo).

## Verdict

**Don't build it.** Open-Meteo's ICON-D2 columns are sane, fresh, browser-callable and free for this site, but in the emagram's range (ground to 600 hPa) they hold only six real model levels at fixed pressures (1000, 975, 950, 850, 700, 600 hPa), of which a sounding station gets two to five above its ground (Bellinzona five, Samedan two). ICON-CH1 has about 40 levels over the same range. An emagram from ICON-D2 can't show where an inversion lies, how high thermals reach or where the cloud base is, which is what a pilot opens it for; showing it as a fallback would look like a sounding without being usable as one.

Revisit when Open-Meteo serves MeteoSwiss ICON-CH1/CH2 on levels (still a `TODO` in its downloader, below), or try Météo-France AROME through Open-Meteo, which has 50 hPa steps (untested beyond a level count, below). No plan item.

## Upstream, re-checked

At 20:28 UTC `meteo_swiss:icon_ch1/runs` listed 18Z first. For Tuttlingen, Buochs, Sion and Interlaken the 18Z point data answered 404 "meteo_swiss:icon_ch1:TEMPERATURE:2026-11-24T18:00:00Z not available"; 15Z and 12Z answered 200 (about 160 KB) with all 80 levels at nearly one pressure: Tuttlingen 616.7 hPa at the top and 620.6 hPa at the ground (262.5 and 262.9 K), Buochs 786.9 and 787.0, Sion 691.9 and 709.7, Interlaken 790.0 and 790.0. `height_half_level` runs from 22,000 m to the ground as it should. `https://shv-meteo.pages.dev/api/meteo/previtemps/forecast/Buochs` answered 503. Open-Meteo's own copy of ICON-CH1 18Z was available from 19:54 UTC (`/data/meteoswiss_icon_ch1/static/meta.json`), so MeteoSwiss published the run; only upstream's point data is broken.

## 1. The data

**Levels.** One request per station for `temperature`, `relative_humidity`, `dew_point`, `wind_speed`, `wind_direction` and `geopotential_height` on 31 pressure levels from 1000 to 30 hPa, `models=icon_d2`. Only 14 carried values: 1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250 and 200 hPa. The other 17 (the 25 hPa steps such as 875 or 750, and everything above 200) were `null` for every hour, although the [DWD API page](https://open-meteo.com/en/docs/dwd-api) lists 150 to 30 hPa too. The same page says "Levels missing in a model (e.g. 800, 900 and 925 hPa in ICON D2) are interpolated from neighbouring levels", and the data agrees: over 8 stations and 67 hours, 925 and 900 hPa equal the linear-in-pressure interpolation between 950 and 850 to within 0.08 K, and 800 hPa the one between 850 and 700 to within 0.07 K (rounding), while 975 and 850 hPa differ from such an interpolation by up to 2.0 and 7.6 K. So 11 of the 14 levels are model output, and the top is 200 hPa (about 11.8 km) against ICON-CH1's 22 km.

**Sanity.** Eight sounding stations: Buochs, Sion, Interlaken, Tuttlingen, Le Sentier (Jura), Bellinzona (Ticino), Samedan and Zermatt. Each answer had 72 hourly steps, 67 of them complete (00Z today to 18Z on the 26th: Open-Meteo stitches the past hours from earlier runs, then the 18Z run's 48 hours). On every complete step the geopotential height rises from one level to the next, and the span from the surface pressure (793 to 998 hPa) to 200 hPa is about 600 to 800 hPa, so `pointProblem`'s rule (pressure falls at least 300 hPa from the ground to the top) passes everywhere. Lapse rates between neighbouring levels ranged from -0.96 to +1.40 °C per 100 m, never steeper than dry adiabatic; the +1.40 lies between 1000 hPa (179 m) and 975 hPa at Bellinzona, whose ground is at 229 to 324 m, so it comes from an extrapolated level (below).

**Cadence.** ICON-D2 runs every 3 hours with 48 hours of forecast; the 18Z run was available on Open-Meteo at 19:25 UTC (`/data/dwd_icon_d2/static/meta.json`: `last_run_initialisation_time` 1795543200, `last_run_availability_time` 1795548330), an hour and 25 minutes after its start. ICON-CH1 runs every 3 hours with 33 hours.

**Below the ground.** Open-Meteo answers every level, also those under the model's ground; they carry extrapolated values, not `null`. With `&elevation=nan` the answer's `elevation` is the model cell's height instead of the 90 m terrain model's, and `surface_pressure` is the pressure there:

| Station | Real ground | ICON-D2 cell | ICON-CH1 point | Levels under the cell's ground |
| :--- | ---: | ---: | ---: | :--- |
| Bellinzona | 238 m | 324 m | 249 m | 1000 hPa |
| Buochs | 440 m | 463 m | 455 m | 1000, 975 |
| Sion | 515 m | 546 m | 489 m | 1000 to 950 |
| Interlaken | 568 m | 598 m | 576 m | 1000 to 950 |
| Tuttlingen | 645 m | 672 m | 655 m | 1000 to 950 |
| Le Sentier | 1013 m | 1064 m | 1038 m | 1000 to 900 |
| Zermatt | 1620 m | 1878 m | 1737 m | 1000 to 850 |
| Samedan | 1707 m | 1943 m | 1803 m | 1000 to 850 |

The levels under the cell's ground move with the surface pressure, and the hour of this column wasn't recorded. At 2026-11-25 12:00 UTC, the hour section 2 counts, Samedan's 800 hPa is under its cell too, which leaves it 700 and 600 hPa.

A fallback would have to drop every level whose geopotential height is not above the cell's height (or whose pressure exceeds `surface_pressure`; both rules picked the same levels at 12Z tomorrow) and add the ground from `temperature_2m`, `dew_point_2m`, `surface_pressure` and the 10 m wind.

## 2. Fit to the emagram

`levels.ts` keeps the levels from the ground up to 550 hPa, and `emagram.ts` draws 1000 to 600 hPa. Counted at 2026-11-25 12:00 UTC, levels above the model's ground up to 600 hPa (real ones in brackets), against ICON-CH1's levels from the ground to 5,000 m (from today's `height_half_level`, which is still right):

| Station | ICON-D2 levels (real) | Lowest ICON-D2 level above the cell | ICON-CH1 levels to 5,000 m | ICON-CH1 levels in the lowest 1,500 m |
| :--- | :--- | ---: | ---: | ---: |
| Bellinzona | 8 (5) | 23 m | 43 | 21 |
| Buochs | 7 (4) | 60 m | 43 | 22 |
| Sion | 6 (3) | 197 m | 43 | 22 |
| Interlaken | 6 (3) | 139 m | 43 | 22 |
| Tuttlingen | 6 (3) | 74 m | 43 | 23 |
| Le Sentier | 4 (3) | 361 m | 42 | 24 |
| Zermatt | 3 (2) | 44 m | 40 | 25 |
| Samedan | 2 (2) | 1,050 m | 40 | 26 |

Between the real levels the gaps are about 900 m (950 to 850 hPa), 1,550 m (850 to 700) and 1,200 m (700 to 600); ICON-CH1's lowest levels are 20 to 40 m apart. Lost against ICON-CH1: the vertical resolution above all, the 1 km grid (at these eight stations ICON-D2's 2.2 km cell sits 23 to 258 m above the real ground, ICON-CH1's point from 26 m below to 117 m above), the grid point the official app shows, and 22 km of column (irrelevant to the chart). Gained: 48 hours instead of 33, and a run 1.5 hours after its start.

**Rendered.** A throwaway script in a scratch folder fed Open-Meteo's ICON-D2 data for 2026-11-25 12:00 UTC into the repo's own `gridSvg`, `soundingCurves` and `altitudeSvg` (ground from the 2 m and 10 m values, then each level above the cell; nothing committed). The shot is attached to this note's pull request. What it shows:

- **Buochs** (ground 463 m): 950, 925, 900 and 850 hPa read 3.6, 3.6, 3.7 and 3.7 °C, so the chart draws one isothermal segment from 523 to 1,425 m, two of its four points interpolated. A stable layer, but whether it is an inversion capped at 800 m or at 1,400 m, and so how high a thermal would reach, can't be read. The 2 m temperature 60 m below the 950 hPa level gives a lapse rate of -1.7 °C per 100 m, a superadiabatic purple segment that is an artefact of joining a 2 m value to a pressure level.
- **Sion** (546 m): six points, an even -0.6 to -0.9 °C per 100 m up to 4,164 m; any structure inside the 850 to 700 hPa gap (1,434 to 2,976 m, where an Alpine cloud base and thermal top usually lie) is invisible.
- **Samedan** (1,943 m): three points, ground, 2,993 and 4,184 m, so two straight segments; nothing a pilot can use.

Upper winds survive better (wind at 700 and 600 hPa, a turn from north-east to south-west above Sion), but the emagram is read for temperature structure.

## 3. Where the call would run

Directly from the browser: `api.open-meteo.com` answers `access-control-allow-origin: *` on GET and OPTIONS and exposes the `x-ratelimit-*` headers, also on `/data/<model>/static/meta.json`, the only place that names the run. A trimmed request (`temperature`, `dew_point`, `wind_speed`, `wind_direction` and `geopotential_height` on the six real levels, plus the five ground values, 35 variables, two days) was 3,175 B gzip on the wire, 10,866 B of JSON, 63 ms, `X-RateLimit-Cost: 3.5`; the full 14-level request with 90 variables was about 10.5 KB gzip, 38 KB of JSON and cost 9.0. One call per sounding, plus `meta.json` for the run label. It would be a new `ShvApi` method, and a Function would only add CPU and a shared rate limit; `AGENTS.md`'s rule (proxy only what has to be proxied) points to the browser. The built CSP already allows fetches from any `https:` origin.

## 4. Terms and limits

Read on 2026-11-24 from [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing), [licence](https://open-meteo.com/en/licence) and DWD's [legal notes](https://www.dwd.de/DE/service/rechtliche_hinweise/rechtliche_hinweise_node.html) and [source templates](https://www.dwd.de/DE/service/rechtliche_hinweise/vorlagen_quellenangabe.html) (the English DWD copyright pages answered 404).

- **Non-commercial:** the terms' examples include "Private or non-profit websites or apps that do not have subscriptions or advertising"; "Voluntary donations, including contributions through a tip jar, are permitted"; "Websites or apps that have subscriptions or display advertisements" are commercial. **This site qualifies:** it is free, has no ads, no subscriptions and no login.
- **Limits:** "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute", and 300,000 a month, which "are not enforced" until monthly limits are available (pricing). "Rate limits are applied by IP addresses and application", and "we apply limits per Cloudflare user" for Workers. Counting: "Requests for data covering more than 10 weather variables or extending over a period of more than 2 weeks for a single location are considered multiple API calls", fractionally, which matches the 3.5 and 9.0 measured. From the browser each visitor spends their own IP's budget, about 3.5 calls per station opened.
- **Key:** none on the free API; a subscription "grants a commercial use licence and an API key for the dedicated customer endpoint at `customer-api.open-meteo.com`" (from CHF 29 a month, in the page's pricing table).
- **Licence and attribution:** "API data are offered under Attribution 4.0 International (CC BY 4.0)"; "You must give appropriate credit, provide a link to the licence, and indicate if changes were made", and "You must include a link next to any location Open-Meteo data are displayed", for example `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`. The licence page lists DWD as the source of its ICON data; DWD asks for "Quelle: Deutscher Wetterdienst" next to the data, and for changed data at least a mention in a central source list or the legal notice.
- **No warranty:** the data is "provided without any warranty" and the free API "carries no uptime guarantee".
- **Coming change:** "On 30 November 2026, the regular latitude-longitude grids for dwd_icon_global, dwd_icon_eu and dwd_icon_d2 will be replaced with the native ICON grids", with "No action is required by users" (DWD API page). Grid points, and so the cell heights above, will move.

## 5. Failure behaviour, if it is ever built

- **Trigger:** only when the sounding route answers 503, that is when both of upstream's newest runs fail `pointProblem` or are missing; never when upstream answers, and never mixed into one chart: every time step of a fallback chart comes from the same Open-Meteo answer.
- **Labels:** the model in the card's title area as "ICON-D2 (DWD), 2.2 km, via Open-Meteo" instead of "ICON-CH1", the run from `meta.json`, the model cell's height as the ground, and a line saying it stands in while MeteoSwiss ICON-CH1 is unavailable. Every string in all four languages.
- **Attribution,** under the chart: "Weather data by Open-Meteo.com" linked to `https://open-meteo.com/`, "Source: Deutscher Wetterdienst", and CC BY 4.0 linked, with the change stated (pressure levels below the model ground dropped).

## Other models on Open-Meteo

Levels with values at Sion, from a request for every 25 hPa step from 1000 to 550 hPa (`elevation=nan`):

| Model | Levels with values | Cell height at Sion |
| :--- | :--- | ---: |
| `meteofrance_arome_france` (0.025°) | 11: 1000, 950 to 550 every 50 hPa, plus 925 | 511 m |
| `meteofrance_arome_france_hd` (0.01°) | none | 482 m |
| `icon_eu` (7 km) | 9, as ICON-D2 up to 600 | 1,078 m |
| `gfs_global` (0.25°) | 19, every 25 hPa | 1,601 m |
| `ecmwf_ifs025` | 5 | 1,531 m |
| `meteoswiss_icon_ch1`, `_ch2` | none (850 hPa `null` every hour) | |

AROME France at 12Z tomorrow keeps 9 levels above the ground at Sion, 10 at Buochs, 6 at Samedan and 5 at Zermatt, three times ICON-D2 at the high stations, still far short of ICON-CH1, and whether all of them are native wasn't checked. GFS has the levels but a 25 km grid with Sion's ground at 1,601 m. Open-Meteo's MeteoSwiss downloader still opens with its `TODO:` list; the latest commit on `Sources/App/MeteoSwiss` is still `d36d802` (2026-11-02).

## Open questions

- Does AROME France on Open-Meteo carry native 50 hPa levels, and would its emagram be readable at the high stations? A second spike, if the outage lasts.
- When will Open-Meteo add MeteoSwiss levels, and will they be pressure levels (as for ICON-D2) or model levels?
- How long will upstream's ICON-CH1 point data stay broken? It has been since 2026-11-23.

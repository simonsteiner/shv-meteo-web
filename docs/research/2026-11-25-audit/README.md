# Audit of the whole app (2026-11-25)

Two independent audits of `main` at e11aa63, run as subagents with the same [brief](brief.md): Opus 5.5 ([part 1](opus-1.md), [part 2](opus-2.md)) and Gemini 4 Neon ([part 1](gemini-1.md), [part 2](gemini-2.md)). Neither changed the repo. Both decompiled the official app's APK (`apk_analysis/shv-1.1.0/base.apk`, jadx 1.5.1; a native Kotlin/Compose app) and made read-only requests to the live upstreams on 2026-11-25. Both saw 387/387 tests pass and a clean typecheck; lint failed only on the untracked `test-results/`. The fixes are planned in [the audit fix plan](../../plan/2026-11-25-audit-fixes/README.md).

O-Fn is a finding in the Opus report, G-Fn one in the Gemini report. "Both" means both agents found it independently. "Re-checked" means it was verified again after the runs, where the agents disagreed or only one of them found a serious problem. Severity is ranked by the impact on a pilot, not as either agent rated it.

## High

| # | Finding | Location | Found by | Status |
|---|---|---|---|---|
| 1 | Emergency card gives CTCSS **151.4 Hz** and "K-Funk"; Rega publishes 161.300 MHz "E-channel", **123.0 Hz** tone squelch (or none), alarm 5-tone **21414** (ZVEI). Wrong advice on a rescue call. | `src/scripts/i18n/{de,en,fr,it}.ts` (de.ts:228, :271), shown by `components/safety/Emergency.astro` | O-F1 | Re-checked on rega.ch (rega.ch emergency radio pages; the Merkblatt PDF Opus cited answered 404 on the re-check) |
| 2 | `toHpa` treats >5000 as tenths of hPa, but **258 Holfuy/Mistral stations send `pressureSurfaceValue` in Pa** (Pallanza 98730) -> QFE shown ~10x too high. No station sends tenths at all. AGENTS.md, units.ts comment and tests encode the wrong claim. | `src/scripts/units.ts:13-16`, `units.test.ts`, `sheet.test.ts:168`, AGENTS.md | G-F02 (Opus said units OK) | Re-checked live |
| 3 | Edge cache serves a **stale copy up to 24 h old** for every route on upstream error; browser never reads `x-cache`/age, UI shows no "as of". Yesterday's wind/Föhn "calm" can show as live. | `src/scripts/upstream/respond.ts:19,80-101`, `src/scripts/api.ts` | O-F2 | Re-checked (`KEEP_SECONDS = 86400`) |
| 4 | Föhn `stationPressure` falls back to **QFE** when MSL is missing -> ~35-52 hPa delta -> false SEVERE Föhn DANGER. Also uses QFF (`pressure_msl`) while the official app uses `pressure_standard_msl` (QNH), 0.9-1.9 hPa off, under a "QNH" label. | `src/scripts/foehn/report.ts:69-77`, `fetch.ts:29-31`, `pairs.ts:104-106` | Both (O-F3, G-F03; APK `livemap/d.java:36`, `e.java:657`) | Agreed |
| 5 | Sounding heights use half level `l` (upper boundary) instead of mean of `l` and `l+1` (81 half levels / 80 full): +10 m at ground to ~+85 m at 4,600 m, lapse rates ~5% weak, ground level dropped. Fixture hides it. | `src/scripts/emagram/levels.ts:72-93`, `point.fixture.ts` | Both (O-F4, G-F04; APK `ex7.java:162-197` averages) | Agreed, hypsometric cross-check by Opus |
| 6 | **53% of marked BAZL obstacles** (`CABLE_WARNER` 1133, `ORANGE_MARKS` 1039, `RED_WHITE_RED` 120 vs `MARKED` 2018) treated as unmarked by LOD, styling and the sheet; sheet shows "Markiert" badge and "Markierung: Keine" together. Shards must be rebuilt after the fix. | `src/scripts/obstacles/lod.ts:16,61`, `maps/obstacles.ts:75,86,121`, `sheet/obstacle.ts:60,105` | G-F06 | Re-checked on local z13 shards |

## Medium

| # | Finding | Location | Found by |
|---|---|---|---|
| 7 | Weather page wind arrow points **upwind**, map (and official app's `wind_arrow.svg`) **downwind**; missing direction renders a 0° north arrow. | `src/scripts/weather/cards.ts:45,64-66` vs `maps/stations.ts:125` | Both (Gemini rated critical) |
| 8 | Two different "QNH": weather page shows `pressureMslValue` (QFF) as QNH, map shows `pressureStandardMslValue`. Map shows no pressure at all for 83 DWD/Météo-France stations (MSL only). Weather modal drops QFE that the card shows. Test locks in MSL->QNH. | `weather/stations.ts:50`, `maps/stations.ts:68`, `weather/modal.ts:70`, `weather/cards.test.ts:45-47` | Both (O-F8, G-F09) |
| 9 | DABS "Download PDF" link `skybriefing.com/dabs/dabs.pdf` is 404 (`/o/dabs?today` and `/de/dabs` work). Opus: green "ACTIVE, valid today" status is hard-coded, not fetched (synthesized-data hard constraint). | `src/scripts/api.ts:54-67`, `components/safety/Dabs.astro` | Both (status part: Opus only) |
| 10 | Measurements load once per page and never refresh; no reading time shown; upstream includes readings up to ~6 h old (83/2283 > 1 h). | `api.ts:135,207-220`, `sheet/station.ts`, `weather/cards.ts` | O-F6 |
| 11 | Airspace popup ignores secondary (AGL) limits on 31/353 zones (e.g. LSR15 1700 m QNH + 300 m AGL); FL shown only as "m STD". | `src/scripts/maps/airspace.ts:110-137` | O-F9 |
| 12 | Emagram: wind-axis labels 15/30/45 at +35/+62/+90 px, curve plots them at +45/+70/+95 (reads ~3-6 km/h off); no clipPath, warm isotherms and cold dew points cross the wind/pressure columns; levels 550-600 hPa (and >1000 hPa) smear along the chart edges; `altitudeY` snaps without interpolation. | `src/scripts/forecast/emagram.ts:17-34,113-117`, `components/forecast/EmagramCard.astro:199-228`, `emagram/levels.ts:93` | Smear: both (O-F10); rest G-F05 (label offset re-checked) |
| 13 | Time zones: emagram, station chart and outlooks use the browser's zone; Föhn and DABS use Europe/Zurich. Outlooks parse naive Zurich times with `new Date()`. | `forecast/emagram-card.ts:57-73,162`, `charts/station.ts:20-24`, `forecast/outlooks.ts:143-156` | Both (O-F11, G-F11) |
| 14 | Outlook precipitation legends say "/ 12h" in all four languages; the viewer picks the 6 h set. | `forecast/outlooks.ts:125`, `i18n/*.ts` `legendPrecip*` | G-F08 (re-checked) |
| 15 | Map: returning to the METEO category turns on stations but leaves `meteoMode` (WEBCAM/PRESSURE_DIFFERENCE/NONE) highlighted. | `src/scripts/app-state.ts:159-168` | G-F10 |
| 16 | A fresh 200 with a JSON content type is cached without the `notJson` check; an empty or truncated body evicts the good stale copy and is served as a hit for the TTL. | `src/scripts/upstream/respond.ts:138-183` | G-F12 (Opus judged respond.ts OK apart from the age cap) |

## Low

| # | Finding | Location | Found by |
|---|---|---|---|
| 17 | Logbook CSV export doesn't neutralise `= + - @` prefixes (formula injection, own data only). | `src/scripts/safety/csv.ts` `cell()` | O-F15 (Gemini claimed it was neutralised; re-checked: it isn't) |
| 18 | Previtemps nearest-grid-point uses unscaled lon/lat degrees and stays inside one tile. Gemini measured max station-to-point 0.88 km, so impact is small. | `src/scripts/emagram/gridpoint.ts:49-58` | O-F12 |
| 19 | Docs claim the 4/8 hPa Föhn thresholds come from the official app; not found in the APK (they came from the old Express server). Docs also don't say which pressure is used. | `foehn/pairs.ts:1-5`, `docs/architecture/data-pipeline.md:26` | O-F14 |
| 20 | Fee payment link hidden on 2 take-offs whose `fees` text is null. | `src/scripts/sheet/site.ts:185` | G-F13 |
| 21 | CSP `connect-src 'self' https:` broader than needed; `stationId` regex differs between `handoff.ts:21` and `upstream/params.ts:9` (latent). | `src/scripts/access/csp.ts:14-18` | G-F14 |
| 22 | Tests lock in bugs: sounding fixture has N heights for N levels (#5), `cards.test.ts` asserts MSL as QNH (#8), `units.test.ts` asserts tenths (#2); no tests for stale age, QFE fallback, arrow direction. | various | O-F13, G-F02 |

## Both found OK

XSS sinks (escapeHtml, safeUrl, sanitizeForecastHtml allowlist rebuild), CSP script-src hashes, no SSRF (fixed hosts, allowlisted params, sounding names from the grid), no secrets or member data, `fetch` only in `ShvApi`, no post-ES2020 builtins, no empty catches, i18n parity, `featureLatLng` used everywhere, dew point/wind maths, Föhn pair signs, station pairs, types and badge positions match the APK (`PressureDifferenceGeoJsonTransformer`), upstream 403-on-Origin and CORS claims, Kelvin temperatures and km/h wind.

## Not checked by either

Where the official app computes the pair delta and its thresholds (obfuscated); whether an airspace's secondary limit means the higher or lower of the two; live Cloudflare edge-cache behaviour; browser rendering (no dev server run); GitHub workflows.

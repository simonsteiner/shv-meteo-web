# Audit report: Opus 5.5, part 1 (main at e11aa63)

> Opus 5.5 report, part 1 of 2. [Part 2](opus-2.md) · [Merged findings](README.md) · [Brief](brief.md)

Auditor: Opus sub-agent. Read-only on the repo. Scratch (decompiled APK, point-data samples) under `OUTDIR/scratch/`.
APK decompiled with jadx 1.5.1 from `apk_analysis/shv-1.1.0/base.apk` (native Kotlin/Compose app, not React Native or Flutter); sources in `scratch/out/sources/`.
Live checks: read-only GETs to `weather-ws-prod.ubmeteo.io`, `webcam-prod.ubmeteo.io`, `shv-app-ws-prod.shv-app.ch`, `static-prod.ubmeteo.io` and `skybriefing.com` on 2026-11-25 around 16:30 to 17:00 Swiss time.

Baseline: `npm test` passes all 387 tests, `npm run typecheck` reports 0 errors. `npm run lint` fails, but only on the untracked `test-results/.last-run.json` (a Playwright leftover, not in git), so it isn't a repo problem.

---

## F1. The Rega emergency radio card gives the wrong CTCSS tone (151.4 Hz instead of 123.0 Hz)

- **Severity**: high
- **Category**: domain-correctness (safety content)
- **Location**: `src/scripts/i18n/de.ts:228`, `:271`; `en.ts:224`, `:266`; `fr.ts:232`, `:275`; `it.ts:231`, `:273` (shown by `src/components/safety/Emergency.astro:48-49`)
- **Evidence**: In all four languages the emergency card says "161.300 MHz (CTCSS 151.4 Hz)" and "Turn on the CTCSS tone 151.4 Hz!". Rega's own emergency radio page and its Merkblatt Notfunk give a different tone: the Operations Centre is alerted with a 5-tone call (21414, ZVEI), "with or without a 123.0 Hz tone squelch (CTCSS)", and Rega advises buying a radio that works with the **123.0 Hz** tone squelch. No Rega source mentions 151.4 Hz.
- **Impact**: A pilot in a tree or after a crash, with no phone network, sets their radio to CTCSS 151.4 Hz as the app tells them. Rega says the alarm works with 123.0 Hz or with no tone, so a wrong tone risks a call that never reaches the Operations Centre.
- **Fix**: Take the frequency, tone and calling procedure (5-tone 21414) from Rega's Merkblatt, cite it in a comment, and fix all four dictionaries. Also check the "Channel K" name against the same source.
- **Verdict**: CONFIRMED that the code says 151.4 Hz and that Rega's published guidance says 123.0 Hz. Sources: <https://rega.ch/en/our-missions/sites-and-infrastructure/emergency-radio>, <https://www.rega.ch/fileadmin/seiteninhalt/2_Im_Einsatz/2_Standorte_und_Infrasruktur/18_Funknetz_der_Rega/Merkblatt_Notfunk_de.pdf>

## F2. A stale copy of live weather and Föhn data can be served for up to 24 hours as if it were current

- **Severity**: high
- **Category**: robustness / domain-correctness
- **Location**: `src/scripts/upstream/respond.ts:19` (`KEEP_SECONDS = 24 * 60 * 60`), `:80-101` (`fallback`), `:143-154`; client side `src/scripts/api.ts:75-88` (`getJson`)
- **Evidence**: Every 200 is kept in the edge cache for a day. When upstream fails, `respond` serves that copy, at any age up to 24 h, with only `Cache-Control: no-store` and `x-cache: stale` to mark it. No browser code reads `x-cache` or `x-fetched-at` (a grep of `src/` outside `respond.ts` finds nothing). The Föhn report carries `updatedAt`, but no client code reads it either. The age cap is the same for every route: `measurements` (TTL 60 s), `foehn` (60 s) and `timeseries` (180 s) all fall back to copies up to 1,440 times their TTL.
- **Impact**: Upstream `weather-ws-prod` goes down in the morning. The map's wind arrows, the weather page's station cards and the Föhn badge/banner then show yesterday afternoon's values with no hint of their age: a "Calm" Föhn status or light wind from yesterday stands in for today's south föhn. The UI shows no measurement time either (see F6), so the pilot has no way to tell.
- **Fix**: Give each route its own maximum stale age (for example 30 to 60 minutes for `measurements`, `foehn` and `timeseries`; a day is fine for `sounding`, whose run and valid times are shown). Past that age, answer the 503. Also expose the copy's age (a header, or `updatedAt` for Föhn) and show "as of HH:MM" in the UI when it's stale.
- **Verdict**: CONFIRMED (traced in code; `respond.test.ts` checks the fallback but has no age limit to test).

## F3. A Föhn pair whose station lacks MSL pressure is computed against station-level pressure (QFE), producing false ~50 hPa "DANGER" alerts

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/foehn/report.ts:69-77` (`stationPressure`), `src/scripts/foehn/fetch.ts:25-31`
- **Evidence**: `stationPressure` reads `pressureMslValue ?? pressureStandardMslValue ?? pressureSurfaceValue`. Live values at 16:30 for KLO were MSL 1013.3, standard MSL 1011.9 and surface **961.6** hPa; for LUG, 1013.9 / 1013.2 / **977.5**. If either station's MSL value is missing for one cycle, the pair mixes reduced sea-level pressure with raw station pressure. Of the 142 stations in the Föhn box, 89 report no `pressureMslValue`, so missing MSL is common upstream, though all six pair stations had it today. The history (`pairs.ts:104-106`) reads only `pressure_msl`, so the chart and the current value would also disagree.
- **Impact**: For example, LUG's MSL value is missing: delta = 977.5 - 1013.3 = -35.8 hPa, so `assess` gives `SEVERE_NORTH_FOEHN` / `DANGER` on the map, the weather page and the header pill. If KLO is the one missing, the delta is about +52 hPa, a severe south föhn. The secondary fallback, QNH against QFF, adds a bias of 1 to 2 hPa (KLO today: 1013.3 against 1011.9), which matters against the 4 hPa threshold.
- **Fix**: Compare only like with like. Use one pressure kind per pair (both stations' QFF, or both QNH), never surface pressure, and drop the pair (delta null) when that value is missing for either station.
- **Verdict**: CONFIRMED (code path traced, live values measured).

## F4. The sounding's heights come from the wrong level: every level is placed at its upper interface (10 m too high near the ground, about 85 m at 4,600 m)

- **Severity**: medium

- **Category**: domain-correctness / upstream-claim

- **Location**: `src/scripts/emagram/levels.ts:72-93` (`soundingLevels`), `:48-65` (`valuesAt`)

- **Evidence**: Upstream sends 80 full levels for `temperature`, `pressure`, `specific_humidity`, `wind_u` and `wind_v`, but **81** for `height_half_level` (22,000 m at the top down to 576 m, the ground, at Interlaken point 776549, run 1795608000000). The official app declares `HEIGHT_HALF_LEVEL` on its own vertical grid type (`ch/ubique/fluidsdk/meteo/common/models/ForecastVariable.java:88`, `VerticalGridType.b`). `soundingLevels` pairs full level `l` with half level `l`, which is that layer's **upper** boundary. Its height should be the mean of half levels `l` and `l+1`. Measured on the live column:

  | full level | p (hPa) | code height | mid height | error |
  |---|---|---|---|---|
  | 79 (lowest) | 942.6 | 596 m | 586 m | +10 m |
  | 70 | 892.1 | 1068 m | 1034 m | +34 m |
  | 60 | 803.8 | 1926 m | 1876 m | +50 m |
  | 50 | 695.6 | 3090 m | 3024 m | +66 m |
  | 40 | 571.9 | 4615 m | 4529 m | +86 m |

  The hypsometric equation over levels 79 to 70 gives 447 m; the mid heights give 448 m, the code's heights 472 m.

- **Impact**: The emagram's altitude lines (`altitudeY` snaps to the level whose `heightM` is within 150 m) sit up to about 85 m too high, so a pilot reading cloud base or an inversion height at an altitude line gets it wrong by that much. Every lapse rate is about 5% too weak, because dz is too large: a dry-adiabatic -0.98 °C/100 m becomes about -0.93. The ground (576 m) never appears.

- **Fix**: `heightM = (h[l] + h[l+1]) / 2`, with `h` the 81 half levels, plus a test fixture shaped like upstream's (N full levels, N+1 half levels). The current fixture (`point.fixture.ts:7-14`) gives four heights for four levels, which hides the bug.

- **Verdict**: CONFIRMED (live data, hypsometric cross-check).

## F5. The DABS card's "Download the DABS PDF" button links to a 404, and its green "active" status is made up

- **Severity**: medium
- **Category**: domain-correctness / convention (no synthesized data)
- **Location**: `src/scripts/api.ts:54-67` (`buildDabs`), `src/components/safety/Dabs.astro:19-24`
- **Evidence**: `https://www.skybriefing.com/dabs/dabs.pdf` answers **404**, while `https://www.skybriefing.com/o/dabs?today` answers 200 `application/pdf`. `buildDabs` also hard-codes `status: "ACTIVE"` and "valid 00:00 - 23:59 LT (today)", and the card shows a green `dot-active` beside it. Nothing is fetched. A status indicator built from the clock is the kind of synthesized data the hard constraints rule out.
- **Impact**: A pilot doing the mandatory DABS check before a cross-country flight taps the PDF button and gets an error page. The green dot and "valid today" suggest the app has checked the bulletin, which it never does.
- **Fix**: Link `https://www.skybriefing.com/o/dabs?today` (and `?tomorrow` after publication time). Remove the status dot and the "valid" wording, or word the card as a reminder with links only.
- **Verdict**: CONFIRMED (live GETs).

## F6. Live measurements never refresh on an open page, and nothing shows how old they are

- **Severity**: medium
- **Category**: domain-correctness / robustness
- **Location**: `src/scripts/api.ts:135`, `:207-220` (`measurementsPromise` kept for the page's lifetime); `src/scripts/maps/page.ts:345`, `src/scripts/weather/page.ts:354`; `src/scripts/sheet/station.ts:22-54`, `src/scripts/weather/cards.ts:37-75`
- **Evidence**: `getMeasurements` keeps its first successful promise forever, nothing polls or refetches (there's no `setInterval` or `visibilitychange` handler for data), and neither the station sheet nor the station cards read any `*Time` field. Upstream returns readings up to about 6 h old as "current": of 2,283 stations with wind, 83 were more than 1 h old.
- **Impact**: A pilot opens the map at the take-off at 10:00 and checks it again at 12:30. The arrows still show 10:00, and some stations' values were already hours old then. The weather page and the map look live and aren't.
- **Fix**: Refetch every 1 to 2 minutes while the page is visible (the edge TTL is 60 s), show each station's reading time in its sheet and card, and grey out readings older than about 1 h.
- **Verdict**: CONFIRMED (code traced, live ages measured).

## F7. The weather page's wind arrows point the opposite way from the map's, and an unknown direction shows as north

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/weather/cards.ts:45`, `:64-66` against `src/scripts/maps/stations.ts:125`
- **Evidence**: On the map, `ARROW_PATH` points east and is wrapped in `rotate(90 13 13)`, so at 0° it points **south**, the way a north wind blows (downwind). The station card's path `M12 2L4 20l8-4 8 4z` points **up** at 0° and is rotated by `dirDeg`, so a north wind points north (upwind). The card also uses `const dir = v.dirDeg ?? 0`, so a station without a direction gets a north-pointing arrow and the title "Wind direction 0°".
- **Impact**: For Kloten with a 40° wind (live today), the map arrow points south-west and the weather page arrow points north-east. A pilot comparing the two reads opposite winds. A station with no direction shows a confident north arrow.
- **Fix**: Add 180° to the card's rotation (or reuse the map's arrow) and hide the arrow when `dirDeg` is null. A shared helper with one test would keep the two in line.
- **Verdict**: CONFIRMED (SVG geometry traced).

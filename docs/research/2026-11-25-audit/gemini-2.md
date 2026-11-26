# Audit report: Gemini 4 Neon, part 2

> Gemini 4 Neon report, part 2 of 2. [Part 1](gemini-1.md) · [Merged findings](README.md) · [Brief](brief.md)

## F07: Broken DABS PDF download link on the Safety page (`404 Not Found`)

- **Severity**: medium
- **Category**: upstream-claim
- **Location**: `src/scripts/api.ts:60`, `src/components/safety/Dabs.astro:31-38`
- **Evidence**:
  - `src/scripts/api.ts:60` sets `bulletinPdfUrl: "https://www.skybriefing.com/dabs/dabs.pdf"`, rendered as the `"DABS als PDF herunterladen ↗"` button in `src/components/safety/Dabs.astro:31-38`.
  - Live HTTP GET to `https://www.skybriefing.com/dabs/dabs.pdf` on 2026-11-25 returns **`HTTP/1.0 404 Not Found`** (`Content-Type: text/html`, 121 KB error page).
  - Official APK verification: `resources.arsc` (`live_map_dabs_button_url`) links only to `https://www.skybriefing.com/de/dabs` (which returns `HTTP 200`); there is no static `/dabs/dabs.pdf` URL in the APK.
- **Impact**: Pilots clicking `"Download DABS as PDF"` on `/safety/` during pre-flight preparation hit a Skybriefing 404 page instead of the daily airspace bulletin.
- **Fix**: Remove the dead `bulletinPdfUrl` button (keeping the working `https://www.skybriefing.com/de/dabs` link, or localize `/de/dabs`, `/fr/dabs`, `/it/dabs`, `/en/dabs` if verified), unless a verified working Skybriefing PDF endpoint exists.
- **Verdict**: CONFIRMED

---

## F08: Outlooks precipitation legends claim `/ 12h` while the viewer displays 6-hour intervals

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/forecast/outlooks.ts:110-125`, `src/scripts/i18n/de.ts:146-147`, `src/scripts/i18n/en.ts:145-146`, `src/scripts/i18n/fr.ts:147-148`, `src/scripts/i18n/it.ts:146-147`
- **Evidence**:
  - Live probe of `https://static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json` returns two sets for each precipitation type: `intervalHours: 6` (22 frames, `fluid:icon_ch2:precipitation_prob_{weak,strong}_6h`) and `intervalHours: 12` (11 frames, `..._12h`).
  - `src/scripts/forecast/outlooks.ts:125` selects `sets.find((s) => s.files.length >= 20) ?? sets[0]`, which picks the **6-hour** frames (`00:00 to 06:00`, `06:00 to 12:00`, etc.).
  - However, all four language dictionaries hardcode `12h` in the precipitation legend strings:
    - `legendPrecipWeak`: `"(> 0.1 mm / 12h)"`
    - `legendPrecipStrong`: `"(> 1.0 mm / 12h)"`
- **Impact**: Pilots reading precipitation probability over a displayed `06:00 - 12:00` (6h) window are told the probability threshold applies to a 12-hour accumulation window rather than the 6-hour dataset actually rendered.
- **Fix**: Update the precipitation legend strings to reflect the actual interval of the selected dataset (6h, or dynamically format `{hours}h` from `best.intervalHours` since `days_overview.json` includes `intervalHours` on every set and `sets[0]` fallback could differ).
- **Verdict**: CONFIRMED

---

## F09: Map station sheet drops pressure for all 83 DWD and Météo-France stations, disagrees with Weather page on QNH vs QFF, and Station modal hides QFE

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/maps/stations.ts:68`, `src/scripts/weather/stations.ts:50-51`, `src/scripts/weather/modal.ts:70`
- **Evidence**:
  - `src/scripts/maps/stations.ts:68` reads only `toHpa(num(p.pressureStandardMslValue))` (QNH), ignoring `pressureMslValue` (QFF) even though `/api/measurements` fetches `pressure_msl,pressure_standard_msl,pressure_surface`.
  - Live probe of `weather-ws-prod.ubmeteo.io/v1/measurements/current` across the Alps shows:
    - `dwd`: **43 stations** report `pressureMslValue`, **0** report `pressureStandardMslValue`.
    - `meteo_france`: **40 stations** report `pressureMslValue`, **0** report `pressureStandardMslValue`.
  - Meanwhile `src/scripts/weather/stations.ts:50` reads `pressureMslValue ?? pressureStandardMslValue` and labels it `"QNH"` on `/weather/`. Thus the same station (e.g., `meteo_swiss:KLO`) displays `1012 hPa` on `/map/` (`pressureStandardMslValue = 1011.9`) and `1013` on `/weather/` (`pressureMslValue = 1013.4`).
  - Furthermore, `src/scripts/weather/cards.ts:47-50` displays `QFE` (`v.surfaceHpa`) when `qnhHpa` is null, whereas `src/scripts/weather/modal.ts:70` only displays `v.qnhHpa`, showing `-` when the user clicks that card open.
- **Impact**: Clicking any of the 83 DWD or Météo-France stations on `/map/` omits pressure completely; MeteoSwiss stations show conflicting pressure readings between `/map/` and `/weather/`; and Holfuy/Mistral stations show a `QFE` value on their `/weather/` card that vanishes to `-` inside the detail modal.
- **Fix**: Standardize pressure selection across `/map/` and `/weather/` (`pressureStandardMslValue` as true QNH, falling back to `pressureMslValue` labeled QFF/MSL where QNH is absent), and display `surfaceHpa` labeled `QFE` in `weather/modal.ts:70` consistently with `weather/cards.ts`.
- **Verdict**: CONFIRMED

---

## F10: Switching back to the `METEO` map category resets layers to wind stations while leaving `meteoMode` out of sync

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/app-state.ts:56-70,159-168`, `src/scripts/maps/controls.ts:59`
- **Evidence**:
  - `CATEGORY_LAYERS.METEO` (`src/scripts/app-state.ts:62`) is `["stations"]`.
  - `setMapCategory(category)` (`src/scripts/app-state.ts:159-168`) sets every layer key strictly from `CATEGORY_LAYERS[category].includes(key)` and never updates `state.meteoMode`.
  - If the user has `meteoMode` set to `"WEBCAM"`, `"PRESSURE_DIFFERENCE"`, or `"NONE"`, switches category to `"AIRSPACE"` or `"FLYING_AREAS"`, and switches back to `"METEO"`, `layers` becomes `{ stations: true, webcams: false, foehnAxis: false, ... }` while `state.meteoMode` stays `"WEBCAM"` / `"PRESSURE_DIFFERENCE"` / `"NONE"`.
  - Because `stationModeFor(mode)` (`src/scripts/maps/stations.ts`) renders `"WIND"` for any mode other than `"TEMPERATURE"`, the map displays wind arrows while the active pill in the Meteo drawer still highlights Webcams, Pressure Difference, or None.
- **Impact**: Returning to the Meteo tab on `/map/` leaves the selected mode pill and the visible map layer contradicting each other until the user clicks a different mode and clicks back.
- **Fix**: In `setMapCategory("METEO")`, apply `MODE_LAYERS[this.state.meteoMode]` (instead of always turning on `stations`): or explicitly reset `meteoMode` to `"WIND"` when forcing `stations` on.
- **Verdict**: CONFIRMED

---

## F11: Inconsistent time zones across views (`Europe/Zurich` vs browser local time)

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/forecast/emagram-card.ts:58-73,162`, `src/scripts/charts/station.ts:20-24`, `src/scripts/forecast/outlooks.ts:143-156` (compared with `src/scripts/foehn/pairs.ts:117-127` and `src/scripts/api.ts:41-50`)
- **Evidence**:
  - `src/scripts/foehn/pairs.ts:117-127` (`swissTime`) and `src/scripts/api.ts:41-50` (`swissDate`) explicitly format timestamps in `Europe/Zurich`.
  - By contrast, `src/scripts/forecast/emagram-card.ts:58-73,162` (`new Date(ms).getHours()`, `toLocaleTimeString` without `timeZone`) and `src/scripts/charts/station.ts:20-24` (`pad(d.getHours())`) format epoch timestamps in the browser's local time zone. (Note: `src/scripts/charts/charts.test.ts:41-59` uses `new Date(2026, 10, 23, 9, 0)` in local time, masking this.)
  - `src/scripts/forecast/outlooks.ts:144-145` parses naive Zurich wall-clock timestamps from `days_overview.json` (`"2026-11-25T00:00"`, accompanied by `metadata.timeZone: "Europe/Zurich"`) via `new Date(frame.start)`. While this usually echoes the wall-clock hour, it misbehaves if the browser's local time zone has a DST spring-forward gap on a different date than Switzerland (e.g., US/Canada in March), shifting an interval like `02:00` to `03:00`.
- **Impact**: A pilot planning a Swiss flight from another time zone (or using a UTC/privacy-hardened browser) sees Foehn charts and DABS dates in Swiss time (`Europe/Zurich`) while Emagram timelines and 24-hour station charts show UTC or home time without any time zone indicator, causing 1 to 2+ hour misreads of thermal peak and wind timing.
- **Fix**: Format all forecast/measurement timestamps (`emagram-card.ts`, `charts/station.ts`) explicitly with `timeZone: "Europe/Zurich"` (matching `foehn/pairs.ts`), and format `outlooks.ts` naive ISO strings directly (parsing `YYYY-MM-DDTHH:MM` fields or formatting in `Europe/Zurich` via a UTC anchor) instead of `new Date(naiveString)` in local TZ.
- **Verdict**: CONFIRMED

---

## F12: `respond.ts` caches unvalidated 200 responses on first miss, allowing malformed/empty JSON bodies to be served as fresh cache hits

- **Severity**: medium
- **Category**: robustness
- **Location**: `src/scripts/upstream/respond.ts:138-183`
- **Evidence**:
  - On a cache miss or expired TTL, `respond()` checks `upstream.ok` and `/\bjson\b/i.test(type)` (`respond.ts:132-142`), then immediately cancels any `stale` copy (`line 157`), `tee()`s `upstream.body`, writes `toCache` into `caches.default` with `max-age=86400` and `x-fetched-at: now`, and streams `toClient`.
  - JSON validation (`notJson()`) only runs inside `fallback()` (`respond.ts:80-100`) when a *later* upstream request fails: never before caching or serving a fresh response.
  - Note: the code comment at `respond.ts:20-23` intentionally avoids full `JSON.parse` on 2 MB payloads to stay within Cloudflare Pages' 10 ms Free-plan CPU budget, which explains streaming `/api/measurements`, but for smaller routes (or an empty/HTML/truncated 200 response that happens to carry `application/json`), `stale` is discarded and the broken body is cached and served as `x-cache: hit` for the full TTL (`60s-1800s`).
- **Impact**: If an upstream returns HTTP `200` with `Content-Type: application/json` and an empty or truncated body (e.g., upstream gateway hiccup), `respond()` discards the valid stale fallback, delivers broken JSON to the client, and caches the broken body as a fresh `hit` for up to 30 minutes (`/api/sounding`, `/api/text-forecast`).
- **Fix**: For routes under `PARSE_LIMIT` (all routes except `/api/measurements`), buffer and run `notJson()` before discarding `stale` and writing to `caches.default` (reusing the existing `notJson` helper). For streaming `/api/measurements`, consider a lightweight `TransformStream` that inspects the first and last non-whitespace bytes before finalizing cache storage (or only cancelling `stale` if the stream completes cleanly).
- **Verdict**: CONFIRMED

---

## F13: Flying-site detail sheet hides payment links when `fees` description text is empty

- **Severity**: low
- **Category**: domain-correctness
- **Location**: `src/scripts/sheet/site.ts:185`
- **Evidence**:
  - `src/scripts/sheet/site.ts:185` renders the fees section only if `text(p.fees)` is non-empty: `text(p.fees) ? fees(p, say) : ""`.
  - In `public/data/flyingsites.geojson` (1,341 features), 2 `launch` features have `fees: null` while setting `feePaymentLink: "https://pay.raisenow.io/kcmhc?analytics.channel=twint_button"`.
- **Impact**: Pilots viewing those 2 take-offs on `/map/` do not see the Twint fee payment button.
- **Fix**: Gate the fees section on `text(p.fees) || safeUrl(p.feePaymentLink) || safeUrl(p.feeQrCodeUrl)` and handle an empty `p.fees` inside `fees()`.
- **Verdict**: CONFIRMED

---

## F14: Broad `https:` wildcards in meta CSP `connect-src`/`img-src`, and `stationId` pattern mismatch between `handoff.ts` and `upstream/params.ts`

- **Severity**: low
- **Category**: security
- **Location**: `src/scripts/access/csp.ts:14-18`, `src/scripts/handoff.ts:21`, `src/scripts/upstream/params.ts:9`
- **Evidence**:
  - Built pages carry `<meta http-equiv="content-security-policy" content="... img-src 'self' data: blob: https:; ... connect-src 'self' https:; ... script-src 'self' 'sha256-...'">`. While `script-src` is tight (no `'unsafe-inline'`, single SHA-256 hash for the theme script), `connect-src 'self' https:` allows browser XHR/`fetch` to any HTTPS origin even though the app only directly fetches a small, fixed list of origins (`data.shv-app.ch`, `static-prod.ubmeteo.io`, `wmts.geo.admin.ch`, `tile.openstreetmap.org`).
  - Separately, `src/scripts/handoff.ts:21` validates station deep-link IDs with `/^[\w-]{1,50}:[^\s]{1,100}$/` while `src/scripts/upstream/params.ts:9` restricts `/api/timeseries/:stationId` to `/^[a-z_]+:[^/\s]{1,100}$/`. Currently all 12 live Ubique providers use lowercase `[a-z_]+`, so this is latent, though a provider key containing uppercase letters, digits, or hyphens would pass `handoff.ts` and get rejected with HTTP 400 by `/api/timeseries`.
- **Impact**: If an injection or malicious dependency ever ran in-origin, `connect-src https:` would not restrict data exfiltration endpoints. The `STATION_ID` regex mismatch is currently latent unless Ubique introduces a provider key with digits/hyphens.
- **Fix**: Narrow `connect-src` in `csp.ts` to `'self'` plus the exact direct upstream origins from `src/scripts/api.ts` (note: `img-src https:` may still need to stay broad because webcam image URLs span many third-party hosts). Align the provider-key regex between `handoff.ts` and `upstream/params.ts`.
- **Verdict**: CONFIRMED

---

## Areas Checked and Found OK

- **XSS & HTML escaping**: Audited all `innerHTML`, `insertAdjacentHTML`, and `set:html` sinks across `src/`. Every upstream and stored string rendered into HTML passes through `escapeHtml()`, every external URL through `safeUrl()` (`http:`/`https:` only), and upstream forecast HTML through `sanitizeForecastHtml()` (verified with `<noscript>`, `<template>`, `<svg>`, `<iframe srcdoc>`, `javascript:`, `<math>`, and `<style>` payloads; all stripped/neutralized).
- **Proxy SSRF & parameter validation**: `src/scripts/upstream/params.ts` strictly validates all route parameters (`bbox` numeric bounds & area/span checks, `parameters` allowlist, `stationId` encoded with `encodeURIComponent`, `lang` allowlist `de|fr|it|en`, `sounding` station name checked against build-time `previtemps_grid.json` whitelist). Functions cannot be abused as open SSRF proxies.
- **Hard constraints (`AGENTS.md`)**:
  - Zero mock, sample, or synthesized meteorological data found anywhere in `src/` or `functions/`.
  - No SHV passwords, OAuth tokens, or member data in browser or Functions; `purgeLegacyAuth()` (`src/scripts/settings.ts`) clears `shv_session_id` and `shv_profile` on every page load.
  - All browser `fetch()` calls live strictly inside `src/scripts/api.ts`.
  - Zero ES2020+ unpolyfilled builtins (`Object.hasOwn`, `.at(`, `structuredClone`, `replaceAll`, `findLast`, `toSorted`, `Promise.any`, `AbortSignal.timeout`) found in `src/`.
  - Zero empty `catch` blocks in `src/` and `functions/`; errors are logged with `[Module]` prefixes.
  - All `data-t*` attributes and `say(...)` keys across `src/**/*.{astro,ts}` resolve cleanly against all four dictionaries (`de`, `fr`, `it`, `en`), enforced by TypeScript typing and `dictionaries.test.ts`.
- **Geometry handling**: Flying sites (`Polygon`, `MultiPolygon`, `LineString`, `Point`) and obstacles consistently use `featureLatLng()` (`src/scripts/maps/centroid.ts`) rather than indexing `geometry.coordinates` directly. `flyingsites.geojson` `launchDirections` only uses the 8 cardinal/intercardinal values (`N, NE, E, SE, S, SW, W, NW`), matching `COMPASS` in `settings.ts` and `sheet/site.ts`.
- **Airspace & Isobars**: `maps/airspace.ts` styles every airspace type present in `public/data/airspaces.geojson` (`CTR, TMA, AWY, CTA, Airfield, Heliport, RMZ, FIZ, W, Q, R`). `https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/{de,en}.svg` returns HTTP `200` (`image/svg+xml`).
- **Previtemps grid**: All 107 stations in `public/data/previtemps_stations.json` map to valid ICON-CH1 grid points in `src/data/previtemps_grid.json` (max station-to-grid distance 0.883 km at Bellinzona).
- **Sounding thermodynamics & wind math**: `dewPoint()` Magnus formula (`src/scripts/emagram/levels.ts:13-22`) is physically sound (`e = q*P / (0.622 + 0.378*q)`), wind speed `Math.hypot(u, v) * 3.6` (ICON `u/v` are in m/s, verified against live ICON-CH1 values), and wind direction `atan2(-u, -v)` follows standard meteorological convention (degrees wind blows *from*).
- **Safety tools (`src/scripts/safety/`)**: CSV export (`csv.ts`) properly quotes and neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`, tab/CR prefixes); logbook (`flights.ts`), checklist (`checklist.ts`), and vario audio (`vario.ts`) are clean and well-tested.
- **Build, types, and unit tests**: `npm test` (387/387), `npm run typecheck` (0 errors), `npm run build` (meta CSP injected into all 7 static HTML pages), and `oxlint` all pass.

## Not Checked

- **Live interactive browser rendering / Playwright visual verification**: Not run (read-only static/API audit; `npm run dev` / `npm run preview` were not launched).
- **Cloudflare Workers production runtime edge-cache behavior**: `caches.default` behavior (`tee()` cancellation on mid-stream upstream abort, Workers CPU timing under 10 ms Free-plan limit) was audited statically and against `respond.test.ts`, not deployed to Cloudflare Pages.
- **GitHub Actions CI/deploy workflows (`.github/workflows/`) and `scripts/shot.ts` / `scripts/dev.ts`**: Not deeply audited (outside core app/domain/security priorities).
- **Historical dated research/plan docs (`docs/research/`, `docs/plan/`)**: Checked key claims against live upstreams and APK, but historical migration notes were not audited line-by-line for drift since they are dated records.

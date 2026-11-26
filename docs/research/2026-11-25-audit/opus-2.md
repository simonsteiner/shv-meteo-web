# Audit report: Opus 5.5, part 2

> Opus 5.5 report, part 2 of 2. [Part 1](opus-1.md) · [Merged findings](README.md) · [Brief](brief.md)

## F8. The weather page and the map label different pressures "QNH" (the weather page shows QFF)

- **Severity**: medium
- **Category**: domain-correctness / tests
- **Location**: `src/scripts/weather/stations.ts:50` (`pressureMslValue ?? pressureStandardMslValue`), `src/scripts/maps/stations.ts:68` (`pressureStandardMslValue`); `src/scripts/weather/cards.test.ts:45-47` tests the first behaviour
- **Evidence**: Upstream sends both `pressureMslValue` (QFF, reduced with the actual temperature) and `pressureStandardMslValue` (QNH, reduced with the standard atmosphere). Live KLO: 1013.3 and 1011.9; GVE: 1011.2 and 1010.2. The map's station sheet shows the standard value as QNH, while the weather page's card shows the MSL (QFF) value under a "QNH" label. The official app's station model reads only `pressureStandardMslValue` (`defpackage/ve4.java:57-59`, serializer fields `pressureStandardMslValue/Time/Quality`; no `pressureMslValue` in the APK).
- **Impact**: The same station shows QNH 1013 on the weather page and 1012 on the map. A pilot setting their altimeter from the weather page is off by 1 to 2 hPa, about 8 to 16 m, more in strong cold or heat.
- **Fix**: Show `pressureStandardMslValue` as QNH everywhere. If QFF is shown at all, label it QFF. Fix the test that asserts MSL→QNH.
- **Verdict**: CONFIRMED (code plus live values plus APK).

## F9. Airspace popups leave out the secondary (AGL) limit on 31 zones

- **Severity**: medium
- **Category**: domain-correctness
- **Location**: `src/scripts/maps/airspace.ts:110-137` (`airspacePopupHtml`)
- **Evidence**: The snapshot `public/data/airspaces.geojson` has `lower/upperMetricSecondaryAltitude/Reference`, and **31** of its 353 zones use them. Examples: `LSR15 Entlebuch R` has a lower limit of 1700 m QNH **and** 300 m AGL; `LSR39A-C` 2750 m QNH and 600 m AGL; `LTA FRANCE 1` FL115 and 900 m AGL. Nothing in `src/` reads a `Secondary` field. The popup also shows FL limits only in their metric "m STD" form (FL195 as "5950 m STD") and has no imperial fallback for the lower limit, while the upper limit gets one.
- **Impact**: A pilot ridge-soaring under LSR15 sees "Lower: 1700 m QNH" and doesn't learn about the AGL part of the floor, which over terrain above about 1400 m decides where the restricted area actually begins. Whether the popup's value is conservative depends on the rule (higher or lower of the two), which the data doesn't state.
- **Fix**: Show the secondary limit next to the primary one (for example "1700 m QNH / 300 m AGL"), and show FL limits as `FL 195` with the metric value second.
- **Verdict**: CONFIRMED that the popup omits it; PLAUSIBLE that this misleads in flight (the combination rule isn't in the data).

## F10. The emagram draws 1000 to 600 hPa but receives levels up to 550 hPa, so the levels above 600 pile up on the top edge

- **Severity**: low
- **Category**: domain-correctness
- **Location**: `src/scripts/emagram/levels.ts:93` (cut-off at 550 hPa), `src/scripts/forecast/emagram.ts:17`, `:29-34` (`pToY` clamps to 600)
- **Evidence**: `pToY` clamps every pressure under 600 hPa to the top, so the 4 to 6 levels between 600 and 550 hPa (about 4,200 to 5,000 m) are drawn at the same y with different temperatures: a horizontal smear of temperature, dew point and wind segments along the top border.
- **Impact**: There's a misleading horizontal stroke at the top of every chart, coloured by a lapse rate computed over a vertical gap that isn't drawn.
- **Fix**: Stop the levels at `P_MIN`, or skip drawing the levels above it.
- **Verdict**: CONFIRMED (code).

## F11. The emagram's times are in the browser's time zone, the Föhn chart's in Swiss time

- **Severity**: low
- **Category**: domain-correctness
- **Location**: `src/scripts/forecast/emagram-card.ts:57-73`, `:162` (`toLocaleDateString` with no `timeZone`, `getHours`); `src/scripts/charts/station.ts:20-24`; compare `src/scripts/foehn/pairs.ts:117-127` (Europe/Zurich)
- **Evidence**: The emagram time, its step label and its ruler, and the station chart, all use the device's zone. The Föhn history uses `Europe/Zurich`.
- **Impact**: A pilot whose phone is on UTC, or travelling from the UK, sees forecast hours shifted by 1 to 2 h against the Swiss text forecast, and different time bases on two tabs.
- **Fix**: Pass `timeZone: "Europe/Zurich"` everywhere, or say which zone each chart uses.
- **Verdict**: CONFIRMED (code).

## F12. The Previtemps grid script picks the "nearest" ICON point by unscaled degrees

- **Severity**: low
- **Category**: domain-correctness
- **Location**: `src/scripts/emagram/gridpoint.ts:49-58`
- **Evidence**: `Math.hypot(dlat, dlon)` treats a degree of longitude like a degree of latitude, but at 46 to 48°N one degree of longitude is about 0.69 of one degree of latitude. The search also stays inside the station's own zoom-10 tile, so a station near a tile edge can't get the closer point in the next tile.
- **Impact**: Some stations get a grid point a few hundred metres off the nearest one; in steep terrain that point's model elevation and column can differ noticeably.
- **Fix**: Scale `dlon` by `cos(lat)`. For a station near a tile edge, also check the neighbouring tile.
- **Verdict**: PLAUSIBLE (not measured which stations are affected).

## F13. The tests lock in two of the bugs above

- **Severity**: low
- **Category**: tests
- **Location**: `src/scripts/emagram/point.fixture.ts:7-14`; `src/scripts/weather/cards.test.ts:45-47`
- **Evidence**: The sounding fixture gives as many heights as full levels, unlike upstream's N+1 half levels (F4), so the level/half-level pairing is never tested. `cards.test.ts` asserts that `pressureMslValue` is shown as "QNH" (F8). No test covers the stale fallback's age (F2), the QFE fallback in `stationPressure` (F3), or the arrow direction on the weather page (F7).
- **Fix**: Make the fixtures match the real shape and add the missing tests along with each fix.
- **Verdict**: CONFIRMED.

## F14. Notes on upstream and APK claims

- **Severity**: low
- **Category**: upstream-claim / docs
- **Location**: `src/scripts/foehn/pairs.ts:1-5`, `docs/architecture/data-pipeline.md:26`
- **Evidence**: The four pairs, their types (`PRESSURE_NORTH_SOUTH` for KLO_LUG and DEM_GRE, `PRESSURE_EAST_WEST` for GVE_GUT, `TEMPERATURE_NORTH_SOUTH` for PIL_MTR) and their badge positions (0.25, 0.5, 0.4, 0.5) match `ch/shv_fsvl/feature/livemap/PressureDifferenceGeoJsonTransformer.java` (static block; a bitmask of 24 means the default 0.5). But the app's measurement model carries only `pressureStandardMslValue` (`defpackage/ve4.java`), while ours prefers `pressureMslValue`. "The four station pairs of the official app" is right about the pairs, not about the pressure they read. I could not find the 4/8 hPa thresholds or the 3/6 hPa gradient thresholds anywhere in the APK; they come from the old Express server, not the app.
- **Fix**: Say in `pairs.ts` and `data-pipeline.md` which pressure is used and that the thresholds are our own, not the app's.
- **Verdict**: CONFIRMED (pairs and pressure field); thresholds UNVERIFIED in the APK.

## F15. The logbook CSV export is open to spreadsheet formula injection

- **Severity**: low
- **Category**: security
- **Location**: `src/scripts/safety/csv.ts:66-68`
- **Evidence**: Cells are quoted RFC 4180-style, but a value starting with `=`, `+`, `-` or `@` isn't neutralised.
- **Impact**: Minor: the logbook is the pilot's own input in their own browser. A pasted note like `=HYPERLINK(...)` becomes a live formula when the CSV is opened in Excel or LibreOffice.
- **Fix**: Prefix such cells with `'`.
- **Verdict**: CONFIRMED (code); low risk.

---

## Checked and found OK

- **Units**: `toCelsius` (>200 is Kelvin) and `toHpa` (>5000 is tenths). Live data: temperatures arrive in Kelvin (276.45). Wind is km/h: the LSZH METAR gives 3.704 = 2 kt × 1.852, so never multiply by 3.6. The callers I checked (weather stations, map stations, Föhn, station chart) all go through `units.ts`.
- **Sounding maths, apart from F4**: dew point from specific humidity (e = qp/(0.622+0.378q), then Magnus/Bolton constants), wind speed from u/v in m/s × 3.6, the meteorological direction `atan2(-u,-v)`, the 550 hPa cut-off, and the `pointProblem` column check. The emagram's barbs point upwind, as barbs should. Interpolation turns direction the short way round.
- **Föhn pair signs**: KLO_LUG is LUG - KLO (positive = south föhn), GVE_GUT is west minus east, DEM_GRE is south minus north, and the temperature pair never alarms. History joins the two series on exact timestamps and labels them in Europe/Zurich.
- **`featureLatLng`** handles Point, Line, Polygon, Multi* and the closing vertex. No direct `geometry.coordinates[...]` indexing outside it.
- **XSS**: every `innerHTML`, `insertAdjacentHTML`, `bindPopup` and `divIcon` HTML I traced (sheets, airspace and wildlife popups, site markers, weather cards, logbook cards, emagram pills, markers and SVG) escapes upstream and stored values, and URLs go through `safeUrl`. `sanitizeForecastHtml` rebuilds the output from an allowlist with escaped text and no attributes, so mXSS can't get through. The isobar SVG is only ever an `<img>`.
- **CSP**: built pages carry a meta CSP with hashed inline scripts, `object-src 'none'` and `base-uri 'self'`, and `frame-ancestors` is in `_headers`. No inline handlers.
- **Open proxy / SSRF**: every upstream host is a constant. The timeseries id must match `^[a-z_]+:[^/\s]{1,100}$` and is `encodeURIComponent`-ed into the path. The sounding name is only a key into the generated grid (unknown names get a 404 before any upstream call or cache lookup). Text-forecast languages are allowlisted. Query keys are allowlisted, also in the cache key. No secrets or member data: no tokens in the code.
- **respond.ts mechanics**: the 503 is never cached, a non-JSON 200 is treated as a failure, a stale copy that fails the JSON check is dropped, there's one deadline for headers and body (`fetchUpstream`), and the cache key comes from the checked parameters. Only the age cap is a problem (F2).
- **Upstream claims checked live**: `weather-ws-prod` and `webcam-prod` answer 403 to an `Origin` header; `days_overview.json` has `access-control-allow-origin: *`; the text forecast `en.json` holds the same German text as `de.json`, and the `en` isobar SVG is byte-identical to `de`, so falling back to German is harmless; the runs list is newest first; `height_half_level` is constant over time (one value per level).
- **Conventions**: no `fetch` in the browser outside `ShvApi`; no ES2021+ builtins (`Object.hasOwn`, `.at`, `structuredClone`, `replaceAll`, `findLast` were all absent; `??=` is lowered); no empty `catch` apart from `safeUrl`'s, which deliberately returns null for an invalid URL; i18n parity is enforced by `dictionaries.test.ts`.

## Could not check

- Where the official app computes a pair's difference and its alert thresholds (the decompiled `livemap` code only builds GeoJSON; the arithmetic is in obfuscated code I didn't trace).
- Whether the airspace secondary limit means "whichever is higher" or "lower" (F9).
- Behaviour of the Functions on Cloudflare (edge cache on `*.pages.dev` against a custom domain, CPU limits). I didn't run `npm run dev` or `npm run build`/`preview`.
- Obstacle shards (`public/data/obstacles/` is git-ignored and was present locally, but I didn't check the shard contents against BAZL).

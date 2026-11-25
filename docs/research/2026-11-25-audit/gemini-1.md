# Audit report: Gemini 4 Neon, part 1 (main at e11aa63)

> Gemini 4 Neon report, part 1 of 2. [Part 2](gemini-2.md) · [Merged findings](README.md) · [Brief](brief.md)

- **Repository**: `the repo root` (`main`, read-only audit)
- **Verification run**: `npm test` (387/387 pass), `npm run typecheck` (0 errors, 0 warnings, 2 hints), `npm run build` (7 pages built with meta CSP), `npm run lint` (`oxlint` 0 errors/warnings; `prettier --check .` fails only on pre-existing untracked `test-results/.last-run.json`), decompilation of `apk_analysis/shv-1.1.0/base.apk` via `jadx 1.5.1` in scratch, and read-only live GET probes against Ubique (`weather-ws-prod.ubmeteo.io`, `static-prod.ubmeteo.io`, `webcam-prod.ubmeteo.io`), SHV (`shv-app-ws-prod.shv-app.ch`), and Skybriefing (`www.skybriefing.com`) on 2026-11-25.

---

## F01: Weather page wind arrows point 180° opposite to the Map page and official SHV app (and fabricate a 0° North arrow when direction is missing)

- **Severity**: critical
- **Category**: domain-correctness
- **Location**: `src/scripts/weather/cards.ts:45,64-66` (compared with `src/scripts/maps/stations.ts:89-90,121-126`)
- **Evidence**:
  - In `src/scripts/maps/stations.ts:89-90,125`, the wind arrow SVG path points right (East), is pre-rotated by `<g transform="rotate(90 13 13)">` so it points **down (South)** at `0°`, and the container rotates by `rotate(${dir}deg)`. Thus `windDirectionValue = 0°` (North wind, blowing from North to South) points South (direction of airflow).
  - Official APK verification: `assets/map/layers/measurement_wind/templates/wind_arrow.svg` uses the exact same path with `transform="rotate(90 13 13)"` (pointing South at `0°`), and `assets/map/layers/measurement_wind/style.json:345-348,779-782` applies `"icon-rotate": ["get", "windDirectionValue"]`.
  - In `src/scripts/weather/cards.ts:64-65`, however, the card renders `<path d="M12 2L4 20l8-4 8 4z"/>` (an arrowhead pointing **up / North** at `0°`) and applies `style="transform: rotate(${dir}deg)"` without the `180°` flip. Consequently, `dir = 0°` points North (toward where the wind comes *from*), **180° opposite** to the Map page and the official app.
  - Additionally, `src/scripts/weather/cards.ts:45` defaults missing wind direction via `const dir = v.dirDeg ?? 0;`, so any station without a wind-direction sensor renders a visible arrow pointing straight North with tooltip `"Windrichtung 0°"`.
- **Impact**: A pilot checking live wind on `/weather/` sees a South wind (`180°`, e.g. Föhn blowing North) as an arrow pointing South, and a North wind (`0°`, Bise blowing South) as an arrow pointing North: directly inverting the flow convention used on `/map/` and in the official SHV app. Stations lacking a direction sensor silently display a bogus `0°` North wind arrow.
- **Fix**: Rotate the arrow in `weather/cards.ts:64-65` by `(dir + 180) % 360` (or invert the SVG path to point down at `0°`) so `/weather/` and `/map/` share the exact same airflow convention. When `v.dirDeg === null`, omit the arrow (or render a neutral dash) rather than defaulting to `0°`.
- **Verdict**: CONFIRMED

---

## F02: `toHpa()` divides Pascals by 10 instead of 100 ("tenths of hPa" upstream claim is false)

- **Severity**: high
- **Category**: upstream-claim
- **Location**: `src/scripts/units.ts:1-16`, `src/scripts/units.test.ts:14-19`, `src/scripts/types.ts:17-18`, `src/scripts/weather/stations.ts:50-51`, `src/scripts/sheet/sheet.test.ts:168`, `AGENTS.md`, `docs/architecture/data-pipeline.md:39`
- **Evidence**:
  - `src/scripts/units.ts:1-16` states `"a pressure above 5000 is in tenths of hPa"` and implements `return v > 5000 ? v / 10 : v;`. Both `src/scripts/units.test.ts:14-19` (`toHpa(10213) === 1021.3`) and `src/scripts/sheet/sheet.test.ts:168` (`pressureStandardMslValue: 10180` -> `1018 hPa`) codify this claim.
  - Live probe of `https://weather-ws-prod.ubmeteo.io/v1/measurements/current` across the full Alps bounding box (3,766 stations across all 12 providers) on 2026-11-25:
    - `pressureMslValue` (142 stations) and `pressureStandardMslValue` (482 stations): 100% arrive directly in hPa (0 values > 2000).
    - `pressureSurfaceValue` (838 stations): **0 values** fall in `2000..40000` (tenths of hPa never occurs); **257 stations** report values `>= 40000`: all in **Pascals** (`holfuy`: 33 stations, `100500 to 102200 Pa`, e.g., `holfuy:1957` reports `101500` in both `/current` and `/timeseries`; `mistral`: 224 stations, `56830 to 163820 Pa`).
- **Impact**: Every Holfuy and Mistral station reporting surface pressure is divided by 10 instead of 100, displaying **10× too high** pressures on `/weather/` cards (e.g., `holfuy:1957` renders `QFE 10150` instead of `QFE 1015`).
- **Fix**: Convert Pascal values (`v > 20000` -> `v / 100`, and if tenths-of-hPa ever needs guarding, handle `> 20000` as Pa first before any smaller heuristic: though live data shows only hPa and Pa exist). Update `units.test.ts`, `sheet/sheet.test.ts`, `types.ts`, `AGENTS.md`, and `docs/architecture/data-pipeline.md`.
- **Verdict**: CONFIRMED

---

## F03: Foehn gradient falls back to station-elevation QFE (`pressureSurfaceValue`) and uses QFF (`pressure_msl`) instead of the official app's QNH (`pressure_standard_msl`) while titling the UI "QNH"

- **Severity**: high
- **Category**: domain-correctness
- **Location**: `src/scripts/foehn/report.ts:69-77`, `src/scripts/foehn/fetch.ts:29-31`, `src/scripts/foehn/pairs.ts:104-106`, `src/scripts/i18n/{de,en,fr,it}.ts` (`weather.foehnTitle`, `weather.qnhFull`)
- **Evidence**:
  - `src/scripts/foehn/report.ts:71-75` computes a Foehn pair station's pressure as `num(p.pressureMslValue) ?? num(p.pressureStandardMslValue) ?? num(p.pressureSurfaceValue)`, and `src/scripts/foehn/fetch.ts:29-31` explicitly fetches `pressure_surface` as a fallback. Surface pressure (QFE) is unreduced station-elevation pressure and cannot be subtracted from a sea-level pressure (MSL/QNH) at a station at a different elevation.
  - Meanwhile, the official SHV APK exclusively uses `pressureStandardMslValue` / `pressure_standard_msl` (QNH) for both the live map pressure-difference layer and the station-difference timeseries:
    - `ch/shv_fsvl/feature/livemap/d.java:36` requests `pressure_standard_msl`.
    - `ch/shv_fsvl/feature/livemap/e.java:657-658` reads `pressureStandardMslValue` (never `pressureMslValue` or `pressureSurfaceValue`).
    - `defpackage/p28.java:48-57` selects `ForecastVariable.m` (`PRESSURE_STANDARD_MSL`) for pressure-difference charts.
  - Live probe on 2026-11-25 for the Foehn stations shows the real numerical gap between QFF (`pressureMslValue`), QNH (`pressureStandardMslValue`), and QFE (`pressureSurfaceValue`):
    - `meteo_swiss:KLO` (426 m): `msl = 1013.4`, `stdMsl = 1011.9`, `surf = 961.6`
    - `meteo_swiss:LUG` (273 m): `msl = 1013.9`, `stdMsl = 1013.3`, `surf = 977.6`
    - `meteo_swiss:GVE` (411 m): `msl = 1011.1`, `stdMsl = 1010.1`, `surf = 961.7`
    - `meteo_swiss:GUT` (440 m): `msl = 1013.9`, `stdMsl = 1012.0`, `surf = 960.2`
    - Resulting gradients: `KLO_LUG (LUG − KLO)` is **`+0.5 hPa`** with QFF vs **`+1.4 hPa`** with QNH (`0.9 hPa` difference); `GVE_GUT (GVE − GUT)` is **`-2.8 hPa`** with QFF vs **`-1.9 hPa`** with QNH (`0.9 hPa` difference, right against the `3.0 hPa` `MODERATE_GRADIENT` threshold).
  - Yet `src/scripts/i18n/de.ts` labels the Foehn card `"Druckdifferenz (QNH)"` (and `en.ts`/`fr.ts`/`it.ts` also present QNH terminology across the weather view).
- **Impact**:
  1. If either station in a Foehn pair temporarily omits MSL pressure and falls back to `pressureSurfaceValue`, `stationPressure()` subtracts QFE from MSL (e.g., `LUG 1013.9 − KLO 961.6 = +52.3 hPa`), triggering a fabricated `SEVERE_SOUTH_FOEHN` (`DANGER`) alarm.
  2. Even in normal operation, reporting QFF (`pressure_msl`) under a `"QNH"` heading diverges by `~0.9 to 1.9 hPa` from the official SHV app's QNH (`pressure_standard_msl`), enough to shift moderate/severe Föhn warnings across the `3 / 4 / 6 / 8 hPa` alert boundaries.
- **Fix**: Remove `pressureSurfaceValue` from `stationPressure()` and `CURRENT_PARAMETERS` completely (if sea-level pressure is absent, return `null`). Align both current and history queries (`foehn/fetch.ts`, `foehn/pairs.ts:105`, `foehn/report.ts:72-73`) to `pressure_standard_msl` (QNH) to match the official SHV app and the UI's QNH label (or, if MeteoSwiss QFF is deliberately desired for Foehn, label it QFF explicitly and never mix QFF and QNH across the two stations of one pair).
- **Verdict**: CONFIRMED

---

## F04: Sounding uses `height_half_level[l]` directly instead of averaging adjacent half-levels (81 half-levels vs 80 full levels)

- **Severity**: high
- **Category**: domain-correctness
- **Location**: `src/scripts/emagram/levels.ts:75-105`
- **Evidence**:
  - Live query to `https://weather-ws-prod.ubmeteo.io/v1/point-data/meteo_swiss:icon_ch1/.../776549` (Interlaken) returns **80** model full levels (`indices 0..79`) for `temperature`, `pressure`, `specific_humidity`, `wind_u`, `wind_v`, and **81** model half levels (`indices 0..80`) for `height_half_level`, where `height_half_level[80] = 576 m` is the model surface and `height_half_level[79] = 596 m` is the top of the lowest layer.
  - Official APK verification: `defpackage/ex7.java:162-197` checks `ForecastVariable.HEIGHT_HALF_LEVEL` (`VerticalGridType.HALF_LEVELS`, ordinal `1`) and computes full-level geometric heights as the midpoint `(hhl[l] + hhl[l + 1]) / 2.0`, producing 80 heights aligned with the 80 full-level thermodynamic and wind values.
  - `src/scripts/emagram/levels.ts:76-80` iterates `for (let l = byParam.temperature.length - 1; l >= 0; l--)` (`l = 79..0`) and reads `byParam.height_half_level[l]` directly, ignoring `height_half_level[80]` entirely.
- **Impact**: Every sounding level is assigned the altitude of the *upper* boundary of its model layer rather than its center, shifting all heights upward by half a layer thickness (+10 m near the surface up to +80 to 90 m around 600 to 550 hPa) and omitting the ground elevation. This biases altitude reference lines (`altitudeSvg`) and distorts near-ground `dz` used to compute `lapseRate`.
- **Fix**: When `byParam.height_half_level.length === byParam.temperature.length + 1`, compute `heightM = (hhl[l] + hhl[l + 1]) / 2` (checking both are finite numbers). Keep a fallback to `hhl[l]` only if lengths are equal.
- **Verdict**: CONFIRMED

---

## F05: Emagram SVG chart misaligns wind-speed axis labels (~5 to 6 km/h error), leaves isotherms/dewpoint unclipped across the wind column, and flattens levels outside 600 to 1000 hPa

- **Severity**: high
- **Category**: domain-correctness
- **Location**: `src/scripts/forecast/emagram.ts:17-42,60-89,105-124`, `src/components/forecast/EmagramCard.astro:79,199-228`, `src/scripts/emagram/levels.ts:93,106-110`
- **Evidence**:
  1. **Wind-speed axis misalignment**: `src/scripts/forecast/emagram.ts:113-117` plots wind speed `s` (`0..45 km/h`) at `x = PAD_L + PLOT_W + 20 + (s / 45) * 75`, which puts `15`, `30`, and `45 km/h` at `PAD_L + PLOT_W + 45`, `+70`, and `+95` (`x = 431, 456, 481`). `src/components/forecast/EmagramCard.astro:199-228` places the `15`, `30`, `45` tick labels at `PAD_L + PLOT_W + 35`, `+62`, and `+90` (`x = 421, 448, 476`): shifted **5 to 10 px left** of the plotted curve.
  2. **Unclipped skew-T plot**: `EmagramCard.astro` has no `<clipPath>` around the skew-T plot (`x = PAD_L..PAD_L + PLOT_W = 46..386`). Because `tToX(20, PAD_T) = 453.0` and `tToX(30, PAD_T) = 521.0`, the `20°C` and `30°C` isotherms in `gridSvg()` draw straight across the wind column (`386..502`), and dry/cold dewpoints (e.g. `-45°C` at `750 hPa` -> `x = -42.8`) draw outside the chart over the pressure labels.
  3. **Clamping mismatch at both ends of pressure axis**: `levels.ts:93` retains levels up to `550 hPa`, while `emagram.ts:17-34` clamps `pToY()` to `[600, 1000]` hPa. Every level between `550` and `600 hPa` (~4,200 to 4,900 m) is squashed onto a flat horizontal line at `y = PAD_T`, and any low-elevation / high-pressure level above `1000 hPa` (e.g., Malcesine 117 m or Basel/Lugano in high pressure) is squashed onto `y = PAD_T + PLOT_H`.
  4. **Inaccurate altitude markers & noisy lapse rates**: `altitudeY()` (`emagram.ts:75-81`) picks the *first* level within `±150 m` without interpolation (up to 149 m vertical error) and falls back to linear `(alt / 5000) * PLOT_H` on a logarithmic pressure scale. Meanwhile `levels.ts:106-110` computes `dt / (dz / 100)` from already-rounded `tempC` (`0.1°C`) and `heightM` (`1 m`) over thin near-surface layers (`dz ~ 20 to 30 m`), amplifying rounding noise by 3 to 5× into misleading lapse-rate colors.
- **Impact**: A pilot reading upper-level wind on the emagram sees wind speeds systematically **~3 to 6 km/h higher** than forecast relative to the `15 / 30 / 45` tick labels (e.g., a 10 km/h wind sits directly over the `15` label). Warm isotherms cross the wind profile, and 550 to 600 hPa / >1000 hPa data render as artificial horizontal kinks at the chart edges.
- **Fix**: Derive the `15 / 30 / 45` label `x` coordinates from the same `windX(kmh)` helper used in `soundingCurves()`; add an SVG `<clipPath>` for `[PAD_L, PAD_T, PLOT_W, PLOT_H]` around the isotherms, temperature, and dewpoint groups; align `P_MIN`/`P_MAX` (e.g., `550..1020` hPa) with `levels.ts`; linearly interpolate `altitudeY()` between bracketing levels (omitting ticks below ground); and compute `lapseRate` from unrounded `tempK` and `heightM`.
- **Verdict**: CONFIRMED

---

## F06: Over half of marked BAZL aviation obstacles (`CABLE_WARNER`, `ORANGE_MARKS`, `RED_WHITE_RED`) are treated as unmarked by LOD, map styling, and the obstacle sheet

- **Severity**: high
- **Category**: domain-correctness
- **Location**: `src/scripts/obstacles/lod.ts:16,61`, `src/scripts/maps/obstacles.ts:75,86,121`, `src/scripts/sheet/obstacle.ts:60,105`
- **Evidence**:
  - Scanning all 163 built `public/data/obstacles/z13/*.json` shards (226,357 features) reveals 5 `marking` values:
    - `NONE`: 222,047
    - `MARKED`: 2,018
    - `CABLE_WARNER`: **1,133** (782 `CATENARY`, 338 `CABLE_CAR`, 12 `BRIDGE`, 1 `BUILDING`)
    - `ORANGE_MARKS`: **1,039** (381 `CABLE_CAR`, 360 `CRANE`, 267 `CATENARY`, 15 `BUILDING`, 12 `POLE`, 4 `BRIDGE`)
    - `RED_WHITE_RED`: **120** (93 `POLE`, 7 `CRANE`, 6 `WINDMILL`, 6 `STACK`, 5 `CATENARY`, 3 `BUILDING`)
  - **2,292 of 4,310 marked obstacles (53.2%)**: including 1,054 marked catenaries and 719 marked cable cars: do not have `marking === "MARKED"`.
  - `src/scripts/obstacles/lod.ts:16,61` checks `p.marking === "MARKED"`, so all 2,292 non-`"MARKED"` marked obstacles lose their marked-obstacle visibility exemption at `z7-z11` and lose marked priority under the 2,000-feature cap (`capFeatures`).
  - `src/scripts/maps/obstacles.ts:75,86,121` likewise only checks `p.marking === "MARKED"` (note: the official APK's `assets/map/layers/bazl_obstacles/style.json` itself uses `["==", ["get", "marking"], "MARKED"]` for transmission lines, though its point icons use `styleId`).
  - `src/scripts/sheet/obstacle.ts` contradicts itself inside the same sheet: line `60` computes `const marked = text(p.marking) !== "" && p.marking !== "NONE"` (rendering the red `"Markiert"` badge in the header), while line `105` checks `p.marking === "MARKED"` and prints **`"Markierung: Keine"`** in the attribute table directly below it.
- **Impact**: Marked cables, cable cars, cranes, and poles with `CABLE_WARNER`, `ORANGE_MARKS`, or `RED_WHITE_RED` are dropped earlier when zoomed out or when the 2,000-feature cap triggers, and clicking any of them opens a sheet that displays both a `"Markiert"` badge and `"Markierung: Keine"`.
- **Fix**: Define a shared `isMarked(marking: unknown): boolean` helper (`typeof marking === "string" && marking.trim() !== "" && marking !== "NONE"`) and use it consistently in `lod.ts`, `maps/obstacles.ts`, and `sheet/obstacle.ts` (ideally displaying the specific marking type or `"Ja"` in the sheet attribute row). Note: rebuild obstacle shards (`npm run obstacles`) after changing `lod.ts` since `scripts/obstacles.ts` uses `visibleAt()` at build time.
- **Verdict**: CONFIRMED

---

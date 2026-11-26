# Fix plan for the 2026-11-25 audit

The [audit](../../research/2026-11-25-audit/README.md) found 22 problems in `main` at e11aa63. This plan turns them into PRs, safety first. Items are A1, A2, ... so they don't clash with the [follow-up plan](../2026-11-24-follow-ups/README.md)'s F numbers; "#n" is the finding's number in the audit's merged table. Line numbers are those of e11aa63; 65 commits merged on 2026-11-25 moved some of them, but every finding except the station id half of #21 still holds on `main` at c390ada.

## Delivery

- As in the follow-up plan: items that don't depend on each other go up as separate PRs off `main`; the owner reviews and merges.
- Each fix starts with a failing test that shows the bug (fixtures shaped like the live upstream response, not like the code's assumption), then the fix.
- Each PR passes `npm run lint`, `npx rumdl check .`, `npm run typecheck`, `npm test` and `npm run build`, and is used in the browser on `npm run dev`; a PR that changes a page attaches before and after shots from `npm run shot`.
- A PR that corrects a claim also corrects it where it is written down: `AGENTS.md`, `docs/architecture/`, code comments.

## Order

| Item | Branch | Findings | Why this place |
| --- | --- | --- | --- |
| A1 | `fix/rega-radio` | #1 | wrong advice on a rescue call |
| A2 | `fix/pressure-units` | #2, part of #22 | pressures shown ten times too high |
| A3 | `fix/foehn-pressure` | #4, #19 | false Föhn danger alerts |
| A4 | `fix/stale-fallback` | #3, #16 | day-old data shown as live |
| A5 | `fix/sounding-heights` | #5, part of #22 | every emagram altitude is wrong |
| A6 | `fix/obstacle-marking` | #6 | half the marked obstacles drop out first |
| A7 | `fix/wind-arrows` | #7 | opposite arrows on two tabs |
| A8 | `fix/pressure-labels` | #8, part of #22 | two different "QNH" values (after A2) |
| A9 | `fix/dabs-card` | #9 | dead link, made-up status |
| A10 | `feat/live-refresh` | #10 | data never refreshes, no reading times (after A4) |
| A11 | `fix/emagram-chart` | #12 | chart misreads (after A5) |
| A12 | `fix/swiss-time` | #13 | mixed time zones |
| A13 | `feat/airspace-secondary-limits` | #11 | after the owner's decision in A15 |
| A14 | `fix/small` | #14, #15, #17, #18, #20, #21 (CSP part) | small and independent |

## A1 `fix/rega-radio`

The emergency card (`safety.kRadio`, `safety.kRadioSub` in `src/scripts/i18n/{de,fr,it,en}.ts`, shown by `src/components/safety/Emergency.astro`) says "Channel K" and "CTCSS 151.4 Hz". Rega publishes 161.300 MHz as the "E-channel", alarm calls "with or without a 123.0 Hz tone squelch (CTCSS)", and the 5-tone alarm call 21414 (ZVEI), acknowledged by three long tones. Take the wording from Rega's own pages in each language (rega.ch has de, fr, it and en versions of the emergency radio page and its "calling out Rega" page), name the source in a comment beside the keys, and add a dictionary test that the four languages give the same frequency, tone and call number. The owner checks the final wording before merge; it is safety content.

## A2 `fix/pressure-units`

`toHpa` (`src/scripts/units.ts`) reads a value above 5000 as tenths of hPa. Live on 2026-11-25 no station sent tenths, and 258 Holfuy and Mistral stations sent `pressureSurfaceValue` in pascals (Pallanza 98730). Make values above 20,000 pascals (divide by 100); measure again across all providers and all three pressure fields before deciding whether the tenths branch stays, and record the counts in the PR. Fix `units.test.ts` and `sheet/sheet.test.ts:168`, which assert tenths, and correct the units bullet in `AGENTS.md`, the comment in `units.ts` and `docs/architecture/data-pipeline.md`.

## A3 `fix/foehn-pressure`

`stationPressure` (`src/scripts/foehn/report.ts:69-77`) falls back from MSL to station pressure (QFE), which makes a 35 to 52 hPa difference and a severe Föhn alert when one station's MSL value is missing. Use one pressure kind for both stations of a pair, and give the pair no difference (null, shown as unavailable) when either value is missing; drop `pressure_surface` from the Föhn request (`foehn/fetch.ts`). The official app reads `pressure_standard_msl` for the pairs (APK `ch/shv_fsvl/feature/livemap/d.java:36`, `e.java:657`); switch the current value and the history (`foehn/pairs.ts:104-106`) to it, so they agree with each other, the app and the "QNH" label. Say in `pairs.ts` and `docs/architecture/data-pipeline.md` which pressure is used and that the 3/6 and 4/8 hPa thresholds are this app's own, not found in the official app (#19). Tests: a missing MSL value gives null, never an alert; history and current use the same field.

## A4 `fix/stale-fallback`

`respond.ts` keeps every 200 for a day (`KEEP_SECONDS`) and serves it at any age when upstream fails. Give each route in `ROUTES` its own maximum stale age (30 to 60 minutes for `measurements`, `timeseries` and `foehn`; a day is fine for `sounding`, which shows its run and valid times) and answer the 503 past it. Send the copy's fetch time to the browser (the existing `x-fetched-at`, exposed through `ShvApi`), so A10 can show "as of HH:MM" on a stale answer. In the same PR, #16: for routes small enough to parse within the CPU budget, run the `notJson` check on a fresh 200 before it replaces the cached copy, so an empty or cut-off body never evicts a good one; `measurements` keeps streaming. Tests in `respond.test.ts` for a copy just inside and just past the limit, and for a fresh empty 200.

## A5 `fix/sounding-heights`

Upstream sends 80 full levels and 81 `height_half_level` values; `soundingLevels` (`src/scripts/emagram/levels.ts:72-93`) gives level `l` the half level `l`, its upper boundary. Use `(h[l] + h[l + 1]) / 2` when there is one more half level than full levels, as the official app does (APK `defpackage/ex7.java:162-197`), and treat any other length as a `pointProblem`. Reshape `point.fixture.ts` to N full and N+1 half levels, and add a test against the Interlaken column in the audit (lowest level 586 m, not 596 m).

## A6 `fix/obstacle-marking`

BAZL's `marking` has five values: `NONE`, `MARKED`, `CABLE_WARNER`, `ORANGE_MARKS`, `RED_WHITE_RED`. `lod.ts`, `maps/obstacles.ts` and the obstacle sheet only treat `MARKED` as marked. Add one `isMarked(marking)` in `src/scripts/obstacles/` (anything but empty or `NONE`), use it in all three, and show the marking's own name in the sheet's attribute row (new strings in all four dictionaries). `lod.ts` runs at build time, so the shards change: run `npm run obstacles` locally and give the before and after counts per zoom in the PR; the deploy job rebuilds them.

## A7 `fix/wind-arrows`

The weather page's arrow (`src/scripts/weather/cards.ts:64-66`) points upwind, the map's (`maps/stations.ts:125`) and the official app's downwind. Move the arrow into one shared helper used by both, add 180° on the weather page, and draw no arrow when the direction is null (today `?? 0` draws north). A test for both: a 0° wind points south, a null direction gives no arrow.

## A8 `fix/pressure-labels` (after A2)

The weather page shows `pressureMslValue` (QFF) as QNH; the map shows `pressureStandardMslValue` and nothing for the 83 DWD and Météo-France stations that only send MSL; the weather modal drops the QFE that its card shows. One helper for both tabs: QNH from `pressureStandardMslValue`, else QFF from `pressureMslValue` labelled QFF, plus QFE from `pressureSurfaceValue`; the modal shows the same values as the card. Fix `weather/cards.test.ts:45-47`, which asserts MSL as QNH; new label strings in all four dictionaries.

## A9 `fix/dabs-card`

`https://www.skybriefing.com/dabs/dabs.pdf` answers 404; `https://www.skybriefing.com/o/dabs?today` answers with the PDF, and the official app links `https://www.skybriefing.com/de/dabs`. Link those (and `?tomorrow` once it is published, if that can be told without a fetch). Remove the hard-coded `status: "ACTIVE"`, the green dot and "valid 00:00 to 23:59 (today)" from `buildDabs` (`src/scripts/api.ts:54-67`): nothing is fetched, so the card is a reminder with links, per the no-synthesized-data constraint.

## A10 `feat/live-refresh` (after A4)

`getMeasurements` keeps its first answer for the page's life. Refetch every 1 to 2 minutes while the page is visible (`visibilitychange`; the edge TTL is 60 s), and redraw the map and the station cards in place. Show each station's reading time (the `*Time` fields) in its sheet and card, grey out readings over an hour old, and show "as of HH:MM" when the answer is a stale copy (A4). New strings in all four dictionaries.

## A11 `fix/emagram-chart` (after A5)

In `src/scripts/forecast/emagram.ts` and `src/components/forecast/EmagramCard.astro`: place the 15/30/45 km/h labels with the same function that places the wind curve; clip isotherms, temperature and dew point to the plot area; draw only the levels inside the chart's pressure range (today 550 to 600 hPa smear along the top, over 1000 hPa along the bottom), or widen the range to the data; interpolate `altitudeY` between the levels around the altitude instead of snapping to one within 150 m; compute `lapseRate` from unrounded values. Before and after shots of one station.

## A12 `fix/swiss-time`

The emagram (`forecast/emagram-card.ts:57-73,162`), the station chart (`charts/station.ts:20-24`) and the outlooks (`forecast/outlooks.ts:143-156`) use the device's time zone; Föhn and DABS use `Europe/Zurich`. Format every time with `timeZone: "Europe/Zurich"` through one helper, and read the outlooks' naive Zurich times as text, not through `new Date()`. Tests run under a non-Swiss `TZ` (for example `TZ=UTC` and `TZ=America/New_York` around a DST change).

## A13 `feat/airspace-secondary-limits` (after A15)

31 of 353 airspaces have a secondary limit (`lower/upperMetricSecondaryAltitude/Reference`, for example LSR15: 1700 m QNH and 300 m AGL) that `airspacePopupHtml` (`src/scripts/maps/airspace.ts:110-137`) never shows. Show both limits, with the rule from A15, and show flight levels as `FL 195` with the metric value second.

## A14 `fix/small`

Small, independent fixes; split into separate PRs if review prefers.

- **#14** The outlook precipitation legends say "/ 12h"; the viewer picks the 6 h set (`forecast/outlooks.ts:125`). Format the interval from the chosen set's `intervalHours`.
- **#15** `setMapCategory("METEO")` (`src/scripts/app-state.ts:159-168`) turns on stations but leaves `meteoMode` as it was; apply the layers of the current `meteoMode` instead.
- **#17** The logbook CSV (`src/scripts/safety/csv.ts`, `cell`) passes `=`, `+`, `-`, `@`, tab and CR at the start of a cell; prefix those cells with `'`.
- **#18** `src/scripts/emagram/gridpoint.ts:49-58` measures in unscaled degrees and stays in one tile; scale longitude by `cos(lat)`, check neighbouring tiles, rerun `npm run grid` and commit the new grid if any point changes.
- **#20** The site sheet (`src/scripts/sheet/site.ts:185`) hides the fee payment link when the fee text is empty; show the fee section when any of the text, link or QR code is there.
- **#21** Narrow `connect-src` in `src/scripts/access/csp.ts` to `'self'` and the origins `ShvApi` calls directly (`img-src` stays broad for the webcams; check on `npm run build && npm run preview`), (the mismatched station id pattern the audit also found was fixed before this plan: `handoff.ts` and `params.ts` now share `STATION_ID`).

## A15 Decisions and checks for the owner

- **Rega wording (A1):** review the four languages against Rega's pages before merge.
- **Airspace secondary limits (A13):** find out whether a zone with two lower limits begins at the higher or the lower of the two (BAZL or skybriefing documentation, or ask the SHV), and how the official app shows it. Neither audit could settle it.
- **Föhn thresholds (A3):** keep this app's 3/6 and 4/8 hPa thresholds or look for the official app's own; neither audit found them in the decompiled code.
- **Not checked by the audit:** the edge cache on Cloudflare itself, the GitHub workflows, and the app in a browser. Do those checks with A4, as part of the next workflow change, and with each PR's browser check.

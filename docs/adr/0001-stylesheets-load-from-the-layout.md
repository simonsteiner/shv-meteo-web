# Every stylesheet loads from the layout, in main.css order

`src/layouts/Base.astro` imports all of `src/styles/*.css`, so every page ships every tab's rules (about 12.9 KB after lightningcss minify and gzip). We keep it that way and do not move a tab's sheets into its page, because the cascade depends on the import order and a per-tab split cannot keep it.

## Considered Options

- **Each tab's page imports its own sheets.** Measured on `npm run build` (2026-11-25): Astro orders a page's CSS by where the page imports it. Imported before `Base`, it links first (`index.*.css`, then `leaflet.*.css`, then `Base.*.css`) and loses every equal-specificity tie with `tokens.css`, `chrome.css`, the map sheets, `sheet.css` and leaflet; imported after, it links last and wins every tie against `forecast.css`, `forms.css`, `responsive.css` and `meteo-extras.css`, which it used to precede. Either way a moved sheet lands at one end of the cascade, never in its place in the middle. The sheets are also not per tab: `weather.css` styles the forecast and safety sections (`.forecast-section`, `.safety-section`, `.section-header-row`, `.badge-tag`, `.section-heading`), `forms.css` serves safety, weather, forecast and the bottom sheet, `meteo-extras.css` serves map, weather, forecast and safety, and the only used names in `forecast.css` style the bottom sheet. Moving `weather.css` alone would unstyle two other tabs.
- **Pin the order with `@layer`.** Needs Safari 15.4, Chrome 99, Firefox 97; the build target is Safari 14, Chrome 87, Firefox 78, and Lightning CSS does not lower `@layer`.

## Consequences

The win would have been small: the largest tab sheets are 1.0 to 2.2 KB gzipped each, and a page could drop at most a few of them. Revisit only if the build target reaches `@layer` support and the shared rules have first been cut out of the tab sheets. `leaflet.css` (6.4 KB gzipped, used by the map and the forecast outlooks and emagram) is the one sheet whose move to its pages would keep its order, since it already comes first.

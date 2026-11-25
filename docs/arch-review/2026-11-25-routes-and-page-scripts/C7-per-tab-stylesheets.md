# C7 · Each tab imports its own stylesheets

[← Report](README.md)

⚪ **Speculative** · `in-process` · ↔ `two-way` · builds on: none

`src/layouts/Base.astro:9-26` · `src/pages/*/index.astro` · `src/styles/*.css`

```mermaid
flowchart LR
  subgraph before["Before"]
    direction TB
    B1["Base.astro · imports 16 sheets"]:::leak
    B1 --> W1["weather.css"]:::module
    B1 --> M1["map-*.css"]:::module
    B1 --> F1["forecast-*.css"]:::module
    B1 --> S1["safety.css"]:::module
  end
  subgraph after["After"]
    direction TB
    B2["Base.astro · tokens, chrome, forms, responsive"]:::module
    WP2["weather/index.astro"]:::module --> W2["weather.css"]:::module
    MP2["map/index.astro"]:::module --> M2["map-*.css"]:::module
  end
  before ~~~ after
  classDef module fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#0f172a
  classDef shallow fill:#f1f5f9,stroke:#94a3b8,stroke-dasharray:4 3,color:#334155
  classDef deep fill:#0f172a,stroke:#0f172a,color:#e2e8f0
  classDef faded fill:#1e293b,stroke:#475569,color:#94a3b8
  classDef leak fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#991b1b
  style before fill:#fafaf9,stroke:#e2e8f0
  style after fill:#fafaf9,stroke:#e2e8f0
```

`Base.astro` and `weather.css` change together in 3 of their 7 commits each (43%): a tab's style change lands in the layout every tab uses.

**Removes:**

- `src/layouts/Base.astro:15-26`: the tab-specific imports, and with them every page shipping every tab's rules.

| Problem | Solution | Wins |
|---|---|---|
| The shared layout imports every tab's stylesheet, so every page ships all of them and tab work touches the layout. | `Base.astro` keeps the shared sheets and each tab's page imports its own. | locality: tab styles beside the tab<br>smaller CSS per page |

Speculative: the sheets are main.css cut at its banners "so every rule keeps its place in the cascade" (`Base.astro:10-11`), so a split must prove `responsive.css` still wins over the tab sheets.

<details>
<summary>Decisions</summary>

<!-- filled during implementation, one line each -->

- Q1: Where does Astro put CSS a page imports relative to CSS the layout imports? → by import position, because moving `weather.css` and `safety.css` into their pages and running `npm run build` linked `index.*.css`, then `leaflet.*.css`, then `Base.*.css` when the page imported them before `Base`, and `index.*.css` last when after; either way a moved sheet leaves its main.css place for one end of the cascade.
- Q2: Can the old order be pinned regardless of link order? → no, because `@layer` needs Safari 15.4 / Chrome 99 / Firefox 97 and `astro.config.mjs` targets Safari 14 / Chrome 87 / Firefox 78, which Lightning CSS does not lower `@layer` for.
- Q3: Is each tab sheet one tab's module? → no, because a class-name grep over `src/components`, `src/scripts`, `src/pages` finds `weather.css` styling forecast and safety (5 names each, e.g. `.forecast-section`, `.section-header-row`), `forms.css` used by safety, weather, forecast and the sheet, `meteo-extras.css` by map, weather, forecast and safety, and `forecast.css`'s only used names (`.metric-card` and kin) in the bottom sheet; the seam the card draws does not exist in the sheets.
- Q4: Which later sheets override a tab sheet on the same selector? → `meteo-extras.css` over `weather.css` (`.provider-filter-pills`) and over `forms.css` (`.modal-header`, `.modal-close`), `responsive.css` only over shared sheets (tokens, chrome, sheet), from a postcss pass over all 15 sheets; those keep their direction under a split, so Q1 and Q3, not these, are the risk.
- Q5: Is the win worth re-cutting the sheets? → no, because the whole layout bundle is 12.9 KB gzipped and the largest tab sheets are 1.0 to 2.2 KB gzipped each (lightningcss minify + gzip), so a page would save a few KB for a cascade reorder no test covers.
- Q6: Outcome → dropped, recorded in `docs/adr/0001-stylesheets-load-from-the-layout.md`. Side fact for a later look: `leaflet.css` (6.4 KB gzipped, used by map and forecast outlooks/emagram only) already links first, so moving it to those pages would keep its order.

</details>

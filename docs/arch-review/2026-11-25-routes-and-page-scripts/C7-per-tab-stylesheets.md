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

`Base.astro` and `weather.css` change together in 3 commits (60%): a tab's style change lands in the layout every tab uses.

**Removes:**

- `src/layouts/Base.astro:15-26`: the tab-specific imports, and with them every page shipping every tab's rules.

| Problem | Solution | Wins |
|---|---|---|
| The shared layout imports every tab's stylesheet, so every page ships all of them and tab work touches the layout. | `Base.astro` keeps the shared sheets and each tab's page imports its own. | locality: tab styles beside the tab<br>smaller CSS per page |

Speculative: the sheets are main.css cut at its banners "so every rule keeps its place in the cascade" (`Base.astro:10-11`), so a split must prove `responsive.css` still wins over the tab sheets.

<details>
<summary>Decisions</summary>

<!-- filled during implementation, one line each -->

</details>

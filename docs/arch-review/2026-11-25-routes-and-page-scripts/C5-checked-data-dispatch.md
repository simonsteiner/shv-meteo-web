# C5 · Check data-* values before they reach the store

[← Report](README.md)

🟡 **Worth exploring** · `in-process` · ↔ `two-way` · builds on: none

`src/scripts/maps/page.ts:184,259-279` · `src/scripts/weather/page.ts:303-324` · `src/scripts/settings.ts:159`

```mermaid
flowchart LR
  subgraph before["Before"]
    direction TB
    MK1[".astro markup · data-base, data-layer, …"]:::module
    MK1 --> MP1["maps/page.ts · else-if chain"]:::leak
    MK1 --> WP1["weather/page.ts · includes, then as"]:::leak
    MP1 -- "as BaseMap, as Compass, …" --> ST1["store setters"]:::module
    WP1 -- "as Provider" --> ST1
  end
  subgraph after["After"]
    direction TB
    MK2[".astro markup"]:::module --> G2["oneOf(values, raw) · T or null"]:::deep
    G2 --> ST2["store setters"]:::module
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

Seven `as` casts turn markup strings into store unions with no check; `settings.ts:159` already guards stored values with a type-guard filter, so the pattern exists once and is copied nowhere.

**Removes:**

- `src/scripts/maps/page.ts:268-271`: `as MapCategory`, `as MeteoMode`, `as BaseMap`, `as Compass`.
- `src/scripts/maps/page.ts:275`: `layer as keyof Layers`.
- `src/scripts/weather/page.ts:315,320-321`: the ad hoc tab check and `pill as Provider`.

| Problem | Solution | Wins |
|---|---|---|
| A typo in a `data-*` attribute reaches a store setter as an invalid union member, because each page casts instead of checking. | One guard checks a raw attribute against the union's value list, and the pages pass only what it accepts. | casts go; typos are ignored and logged<br>leverage: one guard, two pages |

<details>
<summary>Decisions</summary>

<!-- filled during implementation, one line each -->

</details>

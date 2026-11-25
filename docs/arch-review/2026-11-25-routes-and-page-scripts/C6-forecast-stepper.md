# C6 · One stepper for the forecast play buttons

[← Report](README.md)

🟡 **Worth exploring** · `in-process` · ↔ `two-way` · builds on: none

`src/scripts/forecast/emagram-card.ts:16,45,165-180` · `src/scripts/forecast/outlooks-page.ts:35,96,205-216`

```mermaid
flowchart LR
  subgraph before["Before"]
    direction TB
    EC1["emagram-card.ts · timer, PLAY_MS 800, step, stop"]:::leak
    OP1["outlooks-page.ts · timer, PLAY_MS 1200, step, stop"]:::leak
  end
  subgraph after["After"]
    direction TB
    EC2["emagram-card.ts"]:::module --> SP2["stepper · toggle, stop, playing"]:::deep
    OP2["outlooks-page.ts"]:::module --> SP2
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

Two copies of a play/step timer have drifted: one adds the playing class by hand and returns early, the other toggles and re-renders.

**Removes:**

- `src/scripts/forecast/emagram-card.ts:45,174`: its own `setInterval` handle and toggle.
- `src/scripts/forecast/outlooks-page.ts:96,212`: the same, with different playing-state handling.

| Problem | Solution | Wins |
|---|---|---|
| Each forecast view keeps its own interval, step and stop, so the play buttons behave differently and neither is tested. | One stepper module owns the interval and the playing state; each view gives it a length, a delay and what to do on a step. | locality: playback in one module<br>one behaviour for both buttons |

<details>
<summary>Decisions</summary>

<!-- filled during implementation, one line each -->

</details>

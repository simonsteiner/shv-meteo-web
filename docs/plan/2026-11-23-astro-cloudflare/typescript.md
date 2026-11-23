# TypeScript migration

- **Introduced in PR5** (`feat/astro-shell`): `typescript ^6`, `@astrojs/check`, and a `tsconfig.json` copied from the reference project (`extends: astro/tsconfigs/strict`, `noUnusedLocals`, `noUnusedParameters`, `include` `.astro/types.d.ts` and `**/*`, `exclude` `dist`).
- **Legacy JS keeps compiling:** the Astro base config allows JS and `checkJs` is off, so legacy files are not type-checked. No `// @ts-nocheck`; oxlint's `ban-ts-comment` stays on.
- **Checked from day one:** `astro check` covers every `.ts` and `.astro` file, including `functions/**`.
- **No big-bang rename.** Code becomes TypeScript as it moves:

| Code today | Becomes | PR |
| --- | --- | --- |
| Express routes, `emagram_provider.js` | `functions/api/**/*.ts` over `src/scripts/<concern>/*.ts`; `auth.js` deleted | PR9 to PR11 |
| `obstacles_provider.js` | `src/scripts/obstacles/*.ts` in the browser (or a build script) | PR12 |
| Kelvin/hPa conversions (4 copies) | `src/scripts/units.ts` | PR10 |
| `src/services/api.js` | `src/scripts/api.ts` | PR14 |
| `SafetyView.js`, `varioAudio.js` | `src/scripts/safety/*.ts` + `.astro` | PR16 |
| `ProfileView.js` | deleted with auth and the Profile tab | PR13 |
| `WeatherView.js` | `src/scripts/weather/*.ts`, `src/scripts/charts/*.ts` | PR18 |
| `ForecastView.js` | `src/scripts/forecast/*.ts`, `/forecast/[section]` | PR19 |
| `MapView.js`, `BottomSheet.js` | `src/scripts/maps/*.ts`, `src/scripts/sheet/*.ts` | PR20 |
| `main.js`, `state.js`, `Header.js`, `BottomNav.js`, `i18n/*.js` | `src/scripts/{state,i18n/*}.ts` + `.astro` | PR21 |
| `scripts/generate_screenshots.js` | `scripts/shot.ts` | PR7 |

## Shared types

- Domain and API shapes live in `src/scripts/types.ts`, a real module imported with `import type`: `MeasurementFeature`, `TimeseriesResponse`, `Webcam`, `FlyingSiteFeature`, `SoundingStation`, `SoundingLevel`, `Sounding` (glossary terms; "previtemps" stays only in legacy URLs and file names), `StationPair`, `FoehnReport`, `ObstacleFeature`.
- `src/types.d.ts` holds ambient declarations only (`Window`, `ImportMetaEnv`, untyped modules), as in the reference project.
- A module rather than the `.d.ts` because both `functions/` and the browser bundle import the types, as the reference project does with `contract/contract.ts`; explicit imports keep the dependency visible.
- `types.ts` is created in PR9 and grows one PR at a time; near the token budget it splits into `src/scripts/types/<concern>.ts`.

## Strictness

No `any` (oxlint `typescript/no-explicit-any`). Only the Functions that read upstream JSON (foehn, emagram) parse it: it is `unknown` at the fetch and narrowed by small, tested parse functions in `src/scripts/foehn/` and `src/scripts/emagram/`. The proxies stream the body unparsed.

Node runs the `.ts` tests by stripping the types, so the tsconfig adds `erasableSyntaxOnly` (no `enum`, `namespace` or parameter properties) and `allowImportingTsExtensions`; imports name the `.ts` file.

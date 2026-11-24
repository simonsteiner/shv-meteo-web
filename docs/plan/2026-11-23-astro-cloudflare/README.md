# Astro + Cloudflare Pages migration plan (2026-11-23)

Goal: turn this fork into our own Astro site on Cloudflare Pages (`https://shv-meteo.pages.dev`), built like our other Astro projects. Every current view becomes a working page (the Profile tab goes with member login), the API runs as Pages Functions, the code moves to TypeScript, and Express, Python and Docker go away (Python 3 stays only for the git hooks' scripts).

Reference: our current Astro projects on Cloudflare Pages (one primary, one secondary; both private, so only their conventions are written down here). Older projects on Astro 5 with the SSR adapter, or on a Node adapter, are outdated patterns and are not followed.

Line numbers in these files refer to `e1e5525` (`main` before the prettier pass). To map them, use `git show e1e5525:<path>` or `git blame --ignore-revs-file .git-blame-ignore-revs`. A bare `:N` means `server/index.js` unless the sentence names another file. PR8's CSS line ranges are the exception: they refer to `main.css` after the prettier pass, as at `e300b9d` (`chore/oxlint-prettier`).

Prerequisites: the Cloudflare account is the repo owner's. Before PR5's first deploy the owner runs `npx wrangler login`; "the owner approves" means the repo owner, who holds that account. Development needs Node 24 (it runs the `.ts` scripts and tests directly), Python 3 for the git hooks, and from PR7 a Chrome or Chromium binary for the screenshots (`$CHROME` if it isn't on `PATH`).

Domain terms (station pair, sounding, DABS) are in [GLOSSARY.md](../../../GLOSSARY.md). BAZL is the Swiss civil aviation office, which publishes the obstacle data; ICON-CH1 and ICON-CH2 are MeteoSwiss's two forecast models, the finer one first; Previtemps is the official app's name for the sounding feature. "Upstream" means the data services behind the official app (Ubique weather and webcams, SHV, MeteoSwiss ICON, BAZL); [branching.md](branching.md) says "upstream repo" for `unbe/ai-shv-app`.

## Stack this plan builds on

| PR | Branch | Content |
| --- | --- | --- |
| PR1 | `docs/refactor-docs` | AGENTS.md, GLOSSARY.md, `docs/architecture.md`, `docs/setup.md`, `docs/deployment.md`, `docs/reference/shv-native-app.md` |
| PR2 | `chore/lefthook` | lefthook and rumdl; a 5,000-token budget per staged file and a block on em and en dashes |
| PR3 | `chore/oxlint-prettier` | the reference project's oxlint config, prettier, `npm run lint`/`format`, one prettier pass, lint findings fixed, en dashes escaped, oxlint and prettier hooks, temporary file-tokens `exclude:` for oversized legacy files |
| PR4 | `docs/plan` | this plan |

The implementation PRs start at PR5.

## Status (2026-11-24)

PR5 to PR20 have merged, with five follow-ups that the stack's reviews and its first deploys called for, and production runs on `https://shv-meteo.pages.dev`. PR21 and PR22 remain; they and the work left for later are planned in [../2026-11-24-follow-ups/](../2026-11-24-follow-ups/README.md). Where the merged code differs from these files, [data-queries.md](../../architecture/data-queries.md) records what shipped and why, and the plan files say so where it matters.

| Plan | PR | Branch | Notes |
| --- | --- | --- | --- |
| PR5 | [#6](https://github.com/simonsteiner/shv-meteo-web/pull/6) | `feat/astro-shell` |  |
| PR6 | [#7](https://github.com/simonsteiner/shv-meteo-web/pull/7) | `ci/workflows` |  |
| PR7 | [#9](https://github.com/simonsteiner/shv-meteo-web/pull/9) | `chore/shot-script` |  |
| PR8 | [#10](https://github.com/simonsteiner/shv-meteo-web/pull/10) | `refactor/split-main-css` |  |
| PR9 | [#11](https://github.com/simonsteiner/shv-meteo-web/pull/11) | `feat/functions-proxies` | the spike found the edge cache works |
| PR10 | [#12](https://github.com/simonsteiner/shv-meteo-web/pull/12) | `feat/functions-foehn` | over 10 ms CPU, fixed in [#18](https://github.com/simonsteiner/shv-meteo-web/pull/18) |
| PR11 | [#13](https://github.com/simonsteiner/shv-meteo-web/pull/13) | `feat/functions-emagram` | over 10 ms CPU, fixed in [#20](https://github.com/simonsteiner/shv-meteo-web/pull/20) |
| PR12 | [#14](https://github.com/simonsteiner/shv-meteo-web/pull/14) | `feat/obstacles` | the tiles fell short at z7 and z8, so the shard path |
| PR13 | [#15](https://github.com/simonsteiner/shv-meteo-web/pull/15) | `chore/drop-auth` |  |
| PR14 | [#16](https://github.com/simonsteiner/shv-meteo-web/pull/16) | `refactor/api-client-ts` |  |
| follow-up | [#17](https://github.com/simonsteiner/shv-meteo-web/pull/17) | `fix/stack-review` | the review findings on [#6](https://github.com/simonsteiner/shv-meteo-web/pull/6) to [#16](https://github.com/simonsteiner/shv-meteo-web/pull/16) |
| follow-up | [#18](https://github.com/simonsteiner/shv-meteo-web/pull/18) | `fix/foehn-cpu` | filtered upstream calls: `/api/foehn` 5.5 ms CPU median |
| follow-up | [#19](https://github.com/simonsteiner/shv-meteo-web/pull/19) | `fix/sounding-run` | the newest run, not the oldest |
| follow-up | [#20](https://github.com/simonsteiner/shv-meteo-web/pull/20) | `perf/sounding-cpu` | levels built in the browser: a sounding 3 ms CPU median |
| follow-up | [#21](https://github.com/simonsteiner/shv-meteo-web/pull/21) | `fix/review-leftovers` | the deferred review findings that were cheap to fix |
| PR16 | [#23](https://github.com/simonsteiner/shv-meteo-web/pull/23) | `refactor/safety-page` | sets the pattern; the shared `escape.ts`, `dom.ts` and `i18n/text.ts` |
| PR18 | [#24](https://github.com/simonsteiner/shv-meteo-web/pull/24) | `refactor/weather-page` |  |
| PR19 | [#25](https://github.com/simonsteiner/shv-meteo-web/pull/25) | `refactor/forecast-page` | the emagram shows its empty state while upstream's ICON columns are broken |
| PR20 | [#26](https://github.com/simonsteiner/shv-meteo-web/pull/26) | `refactor/map-page` | also took the geolocation code and emptied the file-tokens `exclude:` list |

PR18 to PR20 branched off PR16 side by side and merged one after another, each merging `main` in first. Next: the [follow-up plan](../2026-11-24-follow-ups/README.md), whose first two PRs are this plan's PR21 and PR22, delivered as one `gh stack`.

## Contents

- [audit.md](audit.md): current architecture, per-route Workers compatibility, dead code, security issues, hook constraints
- [conventions.md](conventions.md): what we copy from our reference Astro projects
- [target.md](target.md): target tree, request flow, routing, build-time data, auth, emagram
- [typescript.md](typescript.md): how the code moves to TypeScript
- [prs.md](prs.md): PR5 to PR8, shell, CI, screenshots, CSS split
- [prs-api.md](prs-api.md): PR9 to PR14, API Functions, removal of Express
- [prs-views.md](prs-views.md): PR16 to PR22, view refactors, CSP, dependency graph
- [questions.md](questions.md): decisions, open questions with recommended defaults, and what is left for later
- [branching.md](branching.md): `master` mirrors upstream, `main` is ours
- [../2026-11-24-follow-ups/](../2026-11-24-follow-ups/README.md): what is left after PR20, in order

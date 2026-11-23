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

## Contents

- [audit.md](audit.md): current architecture, per-route Workers compatibility, dead code, security issues, hook constraints
- [conventions.md](conventions.md): what we copy from our reference Astro projects
- [target.md](target.md): target tree, request flow, routing, build-time data, auth, emagram
- [typescript.md](typescript.md): how the code moves to TypeScript
- [prs.md](prs.md): PR5 to PR8, shell, CI, screenshots, CSS split
- [prs-api.md](prs-api.md): PR9 to PR14, API Functions, removal of Express
- [prs-views.md](prs-views.md): PR16 to PR22, view refactors, CSP, dependency graph
- [questions.md](questions.md): open questions with recommended defaults
- [branching.md](branching.md): `master` mirrors upstream, `main` is ours

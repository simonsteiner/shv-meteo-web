# Astro + Cloudflare Pages migration plan (2026-11-23)

Goal: turn this fork into our own Astro site on Cloudflare Pages (`https://shv-meteo.pages.dev`), built like our other Astro projects. Every current view becomes a working page, the API runs as Pages Functions, the code moves to TypeScript, and Express, Python and Docker go away.

Reference: our current Astro projects on Cloudflare Pages (one primary, one secondary; both private, so only their conventions are written down here). Older projects on Astro 5 with the SSR adapter, or on a Node adapter, are outdated patterns and are not followed.

Line numbers in these files refer to `e1e5525` (`main` before the prettier pass). To map them, use `git show e1e5525:<path>` or `git blame --ignore-revs-file .git-blame-ignore-revs`.

## Stack this plan builds on

| PR | Branch | Content |
| --- | --- | --- |
| PR1 | `docs/refactor-docs` | AGENTS.md, GLOSSARY.md, `docs/architecture.md`, `docs/setup.md`, `docs/deployment.md`, `docs/reference/shv-native-app.md` |
| PR2 | `chore/lefthook` | lefthook and rumdl; file-tokens (5,000) and dash checks |
| PR3 | `chore/oxlint-prettier` | the reference project's oxlint config, prettier, `npm run lint`/`format`, one prettier pass, lint findings fixed, en dashes escaped, oxlint and prettier hooks, temporary file-tokens `exclude:` for oversized legacy files |
| PR4 | `docs/plan` | this plan |

The implementation PRs start at PR5.

## Contents

- [audit.md](audit.md): current architecture, per-route Workers compatibility, dead code, security issues, hook constraints
- [conventions.md](conventions.md): what we copy from our reference Astro projects
- [target.md](target.md): target tree, request flow, routing, build-time data, auth, emagram
- [typescript.md](typescript.md): how the code moves to TypeScript
- [prs.md](prs.md): PR5 to PR15, shell, CI, API functions, removal of Express
- [prs-views.md](prs-views.md): PR16 to PR22, view refactors, CSP, dependency graph
- [questions.md](questions.md): open questions with recommended defaults
- [branching.md](branching.md): `master` mirrors upstream, `main` is ours

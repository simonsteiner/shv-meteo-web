# Conventions to adopt

Taken from our current Astro projects on Cloudflare Pages ("the reference project" and "the secondary reference" below). Older patterns (Astro 5 with the SSR adapter, Astro 6 with the Node adapter) are not followed.

| Area | Convention (source) | For this repo |
| --- | --- | --- |
| Astro | `astro ^7.4`, static output, no adapter (the reference project) | app at the repo root (no Python side to separate); `site: "https://shv-meteo.pages.dev"` |
| API | Pages Functions in `functions/` as thin adapters over tested modules (the secondary reference's `functions/api/feedback.ts`); hand-written context type, no `@cloudflare/workers-types` (the reference project's `functions/_middleware.ts`) | `functions/api/**` keeps today's URL contract, so the legacy client works unchanged |
| wrangler | minimal `wrangler.jsonc`: `name`, `compatibility_date`, `pages_build_output_dir: "dist"` | `name: "shv-meteo"`, no bindings, no secrets |
| Local API | `wrangler pages dev dist` (the reference project's `scripts/pages-dev.ts`) | `astro dev` on :4321 proxies `/api` to :8788 |
| TypeScript | `typescript ^6`, `extends: astro/tsconfigs/strict` plus `noUnusedLocals`/`noUnusedParameters`; `@astrojs/check` as `typecheck` | from PR5 ([typescript.md](typescript.md)) |
| Lint, format | `oxlint --deny-warnings . && prettier --check .`, `prettier-plugin-astro` | done in PR3; the plugin comes in PR5 |
| Tests | `node --experimental-strip-types --test 'src/scripts/**/*.test.ts'`, `node:test`, tests beside the module; no vitest | from PR5 |
| Layout | `src/{components,layouts,pages,scripts,styles,data}`, `src/scripts/<concern>/` pure modules, styles split by concern and imported in order from `Base.astro` | legacy `src/views/`, `src/components/*.js`, `src/state.js`, `src/services/`, `src/i18n/` stay until refactored |
| CSP | `astro:build:done` integration writing a hashed meta CSP (the reference project's `src/scripts/access/csp.ts`) | after the inline handlers are gone (PR22) |
| Leaflet | `leaflet ^1.9.4`, `@types/leaflet`, map code in `src/scripts/maps/`, own chunk via `codeSplitting.groups` | same, plus a `chart.js` chunk |
| Hooks | `astro check` kept out of pre-commit as too slow (the reference project's `lefthook.yml`) | `astro check` as a pre-push job and in CI |
| CI | `ci.yml` on push and PR, `contents: read`, SHA-pinned actions, `persist-credentials: false`, node 24; `deploy.yml` on `workflow_run` of ci on main plus `workflow_dispatch`, head-sha guard, `concurrency: deploy`, token only on the deploy step, `wrangler pages deploy dist --project-name --branch main --commit-hash` | same, plus `npm run build` in ci and a daily `schedule` (the secondary reference's `site.yml`) |
| Node | no `engines` or `.nvmrc`; CI pins node 24 | same |

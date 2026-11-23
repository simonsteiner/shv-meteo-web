# Conventions to adopt

Taken from our current Astro projects on Cloudflare Pages ("the reference project" and "the secondary reference" below). Older patterns (Astro 5 with the SSR adapter, Astro 6 with the Node adapter) are not followed.

| Area | Convention (source) | For this repo |
| --- | --- | --- |
| Astro | `astro ^7.4`, static output, no adapter (the reference project) | app at the repo root (no Python side to separate); `site: "https://shv-meteo.pages.dev"` |
| API | Pages Functions in `functions/` as thin adapters over tested modules (the secondary reference's `functions/api/feedback.ts`); hand-written context type, no `@cloudflare/workers-types` (the reference project's `functions/_middleware.ts`) | `functions/api/**` keeps today's URL contract, so the legacy client works unchanged |
| wrangler | minimal `wrangler.jsonc`: `name`, `compatibility_date`, `pages_build_output_dir: "dist"` | `name: "shv-meteo"`, no bindings, no secrets |
| Local API | `wrangler pages dev dist` (the reference project's `scripts/pages-dev.ts`) | dev: `astro dev` on :4321 proxies `/api` to `wrangler pages dev public` on :8788 (no build); preview: `wrangler pages dev dist` |
| TypeScript | `typescript ^6`, `extends: astro/tsconfigs/strict` plus `noUnusedLocals`/`noUnusedParameters`; `@astrojs/check` as `typecheck` | from PR5 ([typescript.md](typescript.md)) |
| Lint, format | `oxlint --deny-warnings . && prettier --check .`, `prettier-plugin-astro` | done in PR3; the plugin comes in PR5 |
| Tests | `node --test 'src/scripts/**/*.test.ts'` (node 24 strips types itself), `node:test`, tests beside the module; no vitest | from PR5; Functions stay one-line adapters so their logic is tested under `src/scripts/` |
| Layout | `src/{components,layouts,pages,scripts,styles,data}`, `src/scripts/<concern>/` pure modules, styles split by concern and imported in order from `Base.astro` | legacy `src/views/`, `src/components/*.js`, `src/state.js`, `src/services/`, `src/i18n/` stay until refactored |
| CSP | `astro:build:done` integration writing a hashed meta CSP (the reference project's `src/scripts/access/csp.ts`) | after the inline handlers are gone (PR22) |
| Leaflet | `leaflet ^1.9.4`, `@types/leaflet`, map code in `src/scripts/maps/`, own chunk via `codeSplitting.groups` | same, plus a `chart.js` chunk |
| Hooks | `astro check` kept out of pre-commit as too slow (the reference project's `lefthook.yml`) | `astro check` as a pre-push job and in CI |
| CI | `ci.yml` on push and PR, `contents: read`, SHA-pinned actions, `persist-credentials: false`, node 24; `deploy.yml` on `workflow_run` of ci on main plus `workflow_dispatch`, head-sha guard, `concurrency: deploy`, token only on the deploy step, `wrangler pages deploy dist --project-name --branch main --commit-hash` | same, plus `npm run build` in ci, and a daily `schedule` only if PR12 builds shards |
| Node | no `engines` or `.nvmrc`; CI pins node 24 | same |

## What the copied pieces do

The reference repos are private, so each piece the PRs copy is described here well enough to write it without them.

- **Deploy guard** (`deploy.yml`, PR6): the job runs only when `workflow_dispatch` was started on `refs/heads/main`, or when the `workflow_run` concluded `success`, was started by a `push`, and its `head_sha` equals `github.sha` (so a ci run on an older commit of `main` never deploys over a newer one). It checks out that `head_sha`, `concurrency: { group: deploy, cancel-in-progress: true }`, and the Cloudflare token is set only on the step that runs `wrangler pages deploy`, never on `npm ci` or the build. If PR12 builds shards it adds a `schedule` trigger and `github.event_name == 'schedule'` to the condition; a scheduled run builds `main`'s head.
- **CSP integration** (`src/scripts/access/csp.ts`, PR22): at `astro:build:done` it reads every built `.html`, hashes (sha256, base64) the body of each inline `<script>` that has no `src` and is not `application/json`/`ld+json`, and inserts `<meta http-equiv="content-security-policy">` right after `<meta charset>`, before any script. The policy: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; script-src 'self' <hashes>`. Styles stay inline-able because Leaflet and Chart.js set style attributes. Unit-tested on HTML strings. Chosen over Astro's built-in `security.csp` because it is known to hash every inline script the pages ship; the built-in can replace it later with the same policy.
- **Dev server** (`scripts/dev.ts`, PR9, moved from `server/start-dev.js`): starts `astro dev` on :4321, which proxies `/api` to :8788, and `wrangler pages dev public` on :8788, which compiles `functions/` itself and needs no build (no bindings, this site has no secrets). Ctrl-C stops both.
- **Screenshot script** (`scripts/shot.ts`, PR7): `npm run shot -- URL OUT.png [--size 1280x800] [--wait MS]` launches headless Chromium (`$CHROME`, else Playwright's under `~/.cache/ms-playwright`, else `chromium`) over the DevTools protocol, opens the URL, waits for `load` plus `--wait` ms and writes a PNG. A protocol client rather than `chromium --headless --screenshot`, because the map's tiles load after `load` over the network, and the flag's `--virtual-time-budget` waits in virtual time, which doesn't reliably wait for them.
- **Functions context type**: declared once in `src/scripts/types.ts` and imported by each Function, `interface Context { request: Request; env: Record<string, never>; params: Record<string, string>; waitUntil(p: Promise<unknown>): void }` instead of pulling in `@cloudflare/workers-types`.

# Local setup

## Prerequisites

- **Node.js 24**: it runs the `.ts` tests and scripts directly, stripping their types.
- **npm** (the repo has a `package-lock.json`).
- **Python 3**, for the git hooks' scripts (lefthook's token budget and dash check). Nothing in the app runs Python.

## Install and run

```bash
npm install
npm run dev
```

Only `esbuild`, `lefthook` and `workerd` may run install scripts, each at the version listed under `allowScripts` in `package.json`. After bumping one of them (or `astro` or `wrangler`, which pull them in), `npm install` warns about it; review the new version and run `npm approve-scripts <name>` to update its pin.

`npm run dev` runs [scripts/dev.ts](../scripts/dev.ts), which starts two processes:

- `wrangler pages dev public` on port `8788`, which compiles the Pages Functions in `functions/` without a build
- `astro dev` on port `4321`, which proxies `/api/*` to `http://127.0.0.1:8788` ([astro.config.mjs](../astro.config.mjs))

An `/api` path with no Function answers 404, in dev as in production. Ctrl-C stops both.

Open <http://localhost:4321>; `/` redirects to `/map/` once built (`public/_redirects`), so in dev open <http://localhost:4321/map/>.

How the pages and the shell fit together is in [architecture/web.md](architecture/web.md).

## Checks

```bash
npm run lint       # oxlint and prettier --check, as in the pre-commit hook
npm run typecheck  # astro check; also the pre-push hook
npm test           # node --test over src/scripts/**/*.test.ts
node --experimental-strip-types --test src/scripts/units.test.ts  # one test file
npx rumdl check .  # Markdown lint, as CI runs it; rumdl check --fix in the pre-commit hook
npm run build && npm run e2e  # Playwright over the built site; see below
```

`npm run e2e` runs the browser tests in `e2e/` against `npm run preview` (started for the run, or reused when one is already on 8788), so build first; `npx playwright install chromium` fetches the browser once. They load every page under its CSP and fail on an uncaught error or a CSP violation, and they drive the page wiring no unit test reaches: the map's load-status line and the weather page's retry. The browser reaches only the local site; map tiles and upstreams the browser would call directly are refused, and a test fakes only the failure it needs (a 404 for the obstacle shards, a 503 for `/api/foehn`). Logic still goes in pure modules with unit tests; add a browser test only for what the page script itself gets wrong.

## Data files

Two scripts write data the app reads; both need network:

- `npm run gis` writes copies of the flying sites, airspaces and wildlife reserves into `public/data/gis/` (git-ignored). Only `npm run dev` reads them, so those layers load without the CDN and spare it; rerun it to refresh them, or delete the folder to read the CDN in dev too. A build drops the folder and always reads the CDN.
- `npm run obstacles` downloads the BAZL dataset (about 128 MB, kept a day under `.cache/obstacles/`) and writes the obstacle shards into `public/data/obstacles/` (git-ignored, about 275 MB). Without it the map's obstacle layer stays empty locally; `deploy.yml` runs it before every deploy.
- `npm run grid` rewrites `src/data/previtemps_grid.json`, each sounding station's ICON grid point. Run it after changing `public/data/previtemps_stations.json`, or when a station's sounding answers 503 for a day.

## Build and preview

```bash
npm run build    # astro build into dist/
npm run preview  # wrangler pages dev dist: the built site as Pages serves it, on port 8788
```

`npm run preview` serves exactly what Pages will serve: the built pages, `_redirects` and the Functions. Only the built pages carry the Content Security Policy (`npm run dev` has none), so check a change that loads something from a new origin here.

## Configuration

There is no `.env` file and nothing loads one: the Functions have no bindings and no secrets. Each Function keeps its last good answer in the edge cache (`caches.default`); locally `wrangler` keeps that cache under `.wrangler/`.

## Screenshots

[scripts/shot.ts](../scripts/shot.ts) takes a PNG of one page against a running `npm run dev` or `npm run preview`:

```bash
npm run shot -- http://localhost:4321/map/ /tmp/map.png [--size 1280x800] [--wait 3000] [--no-sandbox]
```

It launches a headless Chromium (`$CHROME`, else Playwright's newest under `~/.cache/ms-playwright`, else `chromium` on `PATH`; that lookup is Linux-only, so on macOS or Windows set `$CHROME` to the browser binary), waits for the load event plus `--wait` ms so the map tiles arrive, and prints the page's exceptions and console errors. `--no-sandbox` is for a container running as root, where Chromium's sandbox won't start. The refactor PRs attach before/after shots taken with it. The README gallery in `screenshots/` is taken with it too.

## Troubleshooting

- **`/api` returns 500 and the Astro terminal logs a proxy error**: `wrangler pages dev` is not running on `8788`; use `npm run dev`.
- **An `/api` call answers 503**: the upstream failed or timed out and the edge cache had no copy yet; the Functions log the cause in the `wrangler` output.

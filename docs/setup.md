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

`npm run dev` runs [scripts/dev.ts](../scripts/dev.ts), which starts two processes:

- `wrangler pages dev public` on port `8788`, which compiles the Pages Functions in `functions/` without a build
- `astro dev` on port `4321`, which proxies `/api/*` to `http://127.0.0.1:8788` ([astro.config.mjs](../astro.config.mjs))

A route not ported to a Function yet answers 404, in dev as in production. Ctrl-C stops both.

Open <http://localhost:4321>; `/` redirects to `/map/` once built (`public/_redirects`), so in dev open <http://localhost:4321/map/>.

## Pages and navigation

Every tab is its own page, `src/pages/<tab>/index.astro`, wrapped in [src/layouts/Base.astro](../src/layouts/Base.astro), which sets `<body data-view>`; `src/main.js` mounts the view it names. Switching tabs navigates, so Back works. Selections handed to the map travel in its URL (`/map/?station=`, `?webcam=`, `?locate`, [src/scripts/handoff.ts](../src/scripts/handoff.ts)); settings that must survive a page load are in localStorage under `shv_*` keys ([src/scripts/settings.ts](../src/scripts/settings.ts)).

## Checks

```bash
npm run lint       # oxlint and prettier --check, as in the pre-commit hook
npm run typecheck  # astro check; also the pre-push hook
npm test           # node --test over src/scripts/**/*.test.ts
```

## Build and preview

```bash
npm run build    # astro build into dist/
npm run preview  # wrangler pages dev dist: the built site as Pages serves it, on port 8788
```

`npm run preview` serves exactly what Pages will serve: the built pages, `_redirects` and the Functions.

## Configuration

There is no `.env` file and nothing loads one: the Functions have no bindings and no secrets. Each Function keeps its last good answer in the edge cache (`caches.default`); locally `wrangler` keeps that cache under `.wrangler/`.

## Screenshots

[scripts/shot.ts](../scripts/shot.ts) takes a PNG of one page against a running `npm run dev` or `npm run preview`:

```bash
npm run shot -- http://localhost:4321/map/ /tmp/map.png [--size 1280x800] [--wait 3000]
```

It launches a headless Chromium (`$CHROME`, else Playwright's newest under `~/.cache/ms-playwright`, else `chromium` on `PATH`), waits for the load event plus `--wait` ms so the map tiles arrive, and prints the page's exceptions and console errors. The refactor PRs attach before/after shots taken with it. The gallery in `screenshots/` predates it and is regenerated once the views are ported.

## Chrome DevTools MCP

[.agents/mcp_config.json](../.agents/mcp_config.json) configures the `chrome-devtools-mcp` server for AI coding agents. It connects to `ws://host.lima.internal:9222/devtools/browser`, a Chrome on the host of a Lima VM; change the endpoint to match where your Chrome runs.

## Troubleshooting

- **`/api` returns 500 and the Astro terminal logs a proxy error**: `wrangler pages dev` is not running on `8788`; use `npm run dev`.
- **An `/api` call answers 503**: the upstream failed or timed out and the edge cache had no copy yet; the Functions log the cause in the `wrangler` output.

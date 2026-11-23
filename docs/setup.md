# Local setup

## Prerequisites

- **Node.js 24**: it runs the `.ts` tests and scripts directly, stripping their types.
- **npm** (the repo has a `package-lock.json`).
- **Python 3**, for the git hooks' scripts (lefthook's token budget and dash check). Until the Pages Functions replace Express, the Python parcel-analysis routes (`/api/emagram/calculate`, `/api/meteo/previtemps/sounding*`) also spawn `python3 server/emagram_calc.py`, and no view calls them.

## Install and run

```bash
npm install
npm run dev
```

`npm run dev` runs [server/start-dev.js](../server/start-dev.js), which starts two processes:

- the Express API ([server/index.js](../server/index.js)) on port `3001`
- `astro dev` on port `4321`, which proxies `/api/*` to `http://127.0.0.1:3001` ([astro.config.mjs](../astro.config.mjs))

Open <http://localhost:4321>; `/` redirects to `/map/` once built (`public/_redirects`), so in dev open <http://localhost:4321/map/>.

To run the API alone: `npm run server` (port 3001).

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

`npm run preview` serves only what Pages will serve: until the Pages Functions land, `/api` answers 404 there.

## Configuration

There is no `.env` file and nothing loads one. The Express server reads one environment variable:

- `PORT`: the Express port, default `3001`.

Caches live in memory, except BAZL obstacle data, which [server/obstacles_provider.js](../server/obstacles_provider.js) writes to `server/cache/` (gitignored; created on first start).

## Screenshots

[scripts/generate_screenshots.js](../scripts/generate_screenshots.js) captures every view into `screenshots/`. It does not launch a browser; it attaches to one you already run:

1. Install `puppeteer-core`, which the script imports but `package.json` does not list: `npm install --no-save puppeteer-core`.
2. Start Chrome with remote debugging on `127.0.0.1:9222` (`--remote-debugging-port=9222`).
3. Start the app (`npm run dev`) and open <http://localhost:4321/map/> in that Chrome.
4. Run `node scripts/generate_screenshots.js`.

## Chrome DevTools MCP

[.agents/mcp_config.json](../.agents/mcp_config.json) configures the `chrome-devtools-mcp` server for AI coding agents. It connects to `ws://host.lima.internal:9222/devtools/browser`, a Chrome on the host of a Lima VM; change the endpoint to match where your Chrome runs.

## Troubleshooting

- **First obstacle request is slow**: the server downloads and indexes the full BAZL dataset (about 122 MB) on first use and keeps it in memory until the server restarts, reusing `server/cache/bazl_obstacles.geojson` when it is under 24 hours old.
- **`/api` returns 500 and the Astro terminal logs a proxy error**: the API is not running on `3001`; start it with `npm run server` or use `npm run dev`.

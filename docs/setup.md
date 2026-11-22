# Local setup

## Prerequisites

- **Node.js** 20 or newer (the Docker image uses Node 22).
- **npm** (the repo has a `package-lock.json`).
- **Python 3**, optional: only the Python parcel-analysis routes (`/api/emagram/calculate`, `/api/meteo/previtemps/sounding*`) spawn `python3 server/emagram_calc.py`, and no view calls them today.

## Install and run

```bash
npm install
npm run dev
```

`npm run dev` runs [server/start-dev.js](../server/start-dev.js), which starts two processes:

- the Express API ([server/index.js](../server/index.js)) on port `3001`
- the Vite dev server on port `3000`, which proxies `/api/*` to `http://127.0.0.1:3001` ([vite.config.js](../vite.config.js))

Open <http://localhost:3000>.

To run the two in separate terminals instead:

```bash
npm run server    # Express API only, port 3001
npm run dev:vite  # Vite only, port 3000
```

## Build and preview

```bash
npm run build    # bundle the frontend into dist/
npm run preview  # serve dist/ on port 3000 (needs the API running on 3001 for /api)
```

When `dist/` exists, the Express server also serves it, together with the API, on its own port. That is how the Docker image runs; see [deployment.md](deployment.md).

## Configuration

There is no `.env` file and nothing loads one. The server reads one environment variable:

- `PORT`: the Express port, default `3001`.

Caches live in memory, except BAZL obstacle data, which [server/obstacles_provider.js](../server/obstacles_provider.js) writes to `server/cache/` (gitignored; created on first start).

## Screenshots

[scripts/generate_screenshots.js](../scripts/generate_screenshots.js) captures every view into `screenshots/`. It does not launch a browser; it attaches to one you already run:

1. Install `puppeteer-core`, which the script imports but `package.json` does not list: `npm install --no-save puppeteer-core`.
2. Start Chrome with remote debugging on `127.0.0.1:9222` (`--remote-debugging-port=9222`).
3. Start the app (`npm run dev`) and open <http://localhost:3000> in that Chrome.
4. Run `node scripts/generate_screenshots.js`.

## Chrome DevTools MCP

[.agents/mcp_config.json](../.agents/mcp_config.json) configures the `chrome-devtools-mcp` server for AI coding agents. It connects to `ws://host.lima.internal:9222/devtools/browser`, a Chrome on the host of a Lima VM; change the endpoint to match where your Chrome runs.

## Troubleshooting

- **Logged out after restarting the server**: sessions and pending logins live in memory in [server/auth.js](../server/auth.js), so a restart drops them. Log in again.
- **First obstacle request is slow**: the server downloads and indexes the full BAZL dataset (about 122 MB) on first use, then serves it from `server/cache/` for 24 hours.
- **`/api` returns 404 or connection refused in the browser**: the API is not running on `3001`; start it with `npm run server` or use `npm run dev`.

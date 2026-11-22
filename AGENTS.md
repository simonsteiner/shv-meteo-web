# Swiss Free Flight

A web app for Swiss paraglider and hang glider pilots that shows flying sites, airspace hazards, live weather and soaring forecasts from the public data behind the official SHV FSVL app. It is a vanilla JavaScript single-page app bundled by Vite (`src/`) plus an Express API (`server/`). The browser loads static GIS data from `public/data/` and calls everything else through `/api/*` on the Express server, which proxies, caches and processes the upstream services (Ubique weather and webcams, SHV, MeteoSwiss ICON, BAZL obstacles, SHV Keycloak).
Domain terms are in `GLOSSARY.md`. A move to Astro on Cloudflare Pages is planned; until it lands, this file describes the current code.

## Commands

```bash
npm install  # install dependencies
npm run dev  # API on 3001 and Vite on 3000 (proxies /api), open http://localhost:3000
npm run server  # Express API only, port 3001
npm run dev:vite  # Vite only, port 3000
npm run build  # bundle the frontend into dist/
npm run preview  # serve dist/ on 3000, needs the API on 3001
node scripts/generate_screenshots.js  # capture all views, see docs/setup.md first
```

## Conventions

### Data access

- **`ShvApi` is the only caller of `fetch` in the browser.** Add new endpoints to `src/services/api.js`; views and components never fetch directly.
- **Proxy only what has to be proxied.** The browser calls an upstream directly only when it allows CORS and the payload is light; anything with CORS limits, heavy data, multi-station math or auth gets an `/api` route in `server/index.js`. The reasoning and the current split are in `docs/architecture.md`.
- **Upstream weather units are quirky.** Wind and gusts already arrive in km/h (never multiply by 3.6), a temperature above 200 is Kelvin, a pressure above 5000 is in tenths of hPa. The conversion is duplicated in `src/components/BottomSheet.js`, `src/views/WeatherView.js` and `server/index.js`; change all three together.
- **Server caches are in memory and serve stale data on upstream errors.** Follow the pattern of the existing routes in `server/index.js` (timeout via `AbortController`, TTL cache, last good response as fallback, 503 with a German error message).

### UI and state

- **App state lives in `store` (`src/state.js`).** Values persisted to `localStorage` use `shv_*` keys.
- **UI strings come from `src/i18n/{de,fr,it,en}.js` through `store.t`.** Add every new key to all four files; German is the default language.
- **Flying-site features are not all points.** Many are `Polygon`, `MultiPolygon` or `LineString`; get a position through the centroid helpers (`getFeatureLatLng()` in `src/views/MapView.js`, `getSiteCenterLatLng()` in `src/components/BottomSheet.js`), never by indexing `geometry.coordinates`.
- **Use the glossary's terms** in code, UI and docs (take-off, not launch site; station pair, not transect).

### Errors

- **Never swallow an error.** Log it with `console.error` and a `[Module]` prefix (for example `[Server]`, `[AppState.method]`); `src/main.js` also logs every uncaught error and rejection.

## Hard constraints

- **Never add mock, sample or synthesized data.** No fake profiles, placeholder ratings, simulated measurements or generated trend curves; show an empty or error state when real data is missing.
- **Never accept or store SHV passwords.** Login happens only on the SHV Keycloak page through the PKCE copy-paste flow in `server/auth.js`.
- **Never send tokens to the browser.** Access and refresh tokens stay in the server session; the browser holds only the session id (`x-session-id` header).
## Gotchas

- **The code was written by LLMs without human review.** Treat comments and doc claims as hints and check them against the code.
- **There are no tests, linter, type checker or CI.** Check a change with `npm run build` and by using it in the browser on `npm run dev`.
- **Views switch by tab state, not by URL.** `store.setTab` swaps the view in `src/main.js`; there are no routes or deep links.
- **Sessions and pending logins live in memory** in `server/auth.js`, so restarting the server logs everyone out.
- **`previtemps_stations.json` exists three times** (`server/data/`, `public/data/`, `src/data/`); the server reads `server/data/` and `src/data/` is unused. Keep the copies identical.
- **The Python script is effectively unused.** `server/emagram_calc.py` backs only `/api/emagram/calculate` and `/api/meteo/previtemps/sounding*`, which no view calls; the emagram the UI shows comes from `server/emagram_provider.js`. `ShvApi.getEmagramSounding` calls a route that does not exist.
- **`public/data/*.geojson` are snapshots of the upstream CDN datasets.** `ShvApi` loads them first and falls back to the CDN URLs in `src/services/api.js`.
- **The first `/api/obstacles` call is slow.** It downloads and indexes the full BAZL dataset (about 122 MB), then serves it from `server/cache/` for 24 hours.

## Docs

- `README.md`: what the app does, screenshots, quickstart.
- `docs/setup.md`: local setup, screenshots tool, Chrome DevTools MCP, troubleshooting.
- `docs/deployment.md`: the Docker image, health check, state and secrets.
- `docs/architecture.md`: data sources, which calls are proxied and why, every `/api` route, how the code is organised. Read before adding or changing an endpoint.
- `docs/reference/shv-native-app.md`: reverse-engineered notes on the official app, Keycloak and the member web service. Read before touching auth or member data.
- `GLOSSARY.md`: domain terms in English and German.

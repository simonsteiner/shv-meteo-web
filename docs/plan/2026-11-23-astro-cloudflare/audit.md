# Audit

## Current architecture

- **Frontend:** a single-page app built with Vite. `index.html` has four mount points. `src/main.js:31-141` switches on `store.state.activeTab` (`:112-136`); it is not a URL router. The tab lives only in memory (`src/state.js:15`), and nothing uses `location.hash`, `pushState` or `popstate`, so there are no deep links and Back does nothing.
- **Views:** classes with `mount`/`unmount` that render HTML strings into `innerHTML`. The shell (`Header`, `BottomNav`, `BottomSheet`) re-renders on every `store.notify()`. Leaflet in `MapView.js` and `ForecastView.js`, Chart.js in `WeatherView.js`.
- **Backend:** one Express file, `server/index.js` (932 lines) on :3001, proxied by Vite in dev (`vite.config.js:7-12`). In-memory caches (`:27-38`), a disk cache in `server/cache/` (`obstacles_provider.js:23-35`), Python via `spawn('python3')` (`:580, :732, :782`). In production Express also serves `dist/` with an SPA fallback (`:918-928`).
- **Docker:** a multi-stage build that installs Python only for `emagram_calc.py` (`Dockerfile:28`).

## Routes on Workers

| Route | Problem | Workers? | Replacement |
| --- | --- | --- | --- |
| `GET /api/health` | Docker healthcheck only | yes | delete |
| `GET /api/measurements` | bbox interpolated unencoded (`:157`); full Alps bbox is 3.1 MB | yes, streamed | Function that streams the body unparsed (parsing would blow the 10 ms free CPU limit), validates the bbox, `max-age=60`. Upstream returns 403 when an `Origin` header is sent, so the proxy stays |
| `GET /api/measurements/timeseries/:id` | `parameters` unencoded (`:47`); cache key ignores `parameters` (`:42`), so a Foehn request poisons the chart request | yes | id regex, `parameters` allowlist, no shared cache |
| `GET /api/webcams` | memory cache | yes | passthrough, `max-age=120` |
| `GET /api/foehn` | calls its own `/api/measurements` over `127.0.0.1` (`:215`); formats `HH:MM` in server-local time (`:122-123`), wrong on Workers (UTC); stateful history (`:452-465`) | after refactor | pure `foehnReport()` module, Swiss bbox (0.84 MB), `Europe/Zurich` labels, no state |
| `GET /api/meteo/text-forecast/:lang` | memory cache | yes | passthrough, lang allowlist |
| `GET /api/meteo/isobaren/:lang` | upstream SVG served from our origin can run script | yes | passthrough plus `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `nosniff` |
| `POST /api/emagram/calculate` | Python per request; never called | no | delete |
| `GET /api/meteo/outlooks` | memory cache | yes | passthrough, `max-age=1800` |
| `GET /api/meteo/previtemps/stations` | `fs.readFileSync` | no as written | Function returning the imported JSON from `src/data/` |
| `GET /api/meteo/previtemps/forecast` (query) | unused | n/a | delete |
| `GET /api/meteo/previtemps/forecast/:name` | parses a 683 KB grid tile per request; unbounded caches (`emagram_provider.js:7-9`); ignores the client's `lat`/`lon` and falls back to Interlaken (`:709-712`) | after refactor | grid points precomputed at build time; catalogue names only, 404 otherwise. This is the emagram the UI shows |
| `GET /api/meteo/previtemps/sounding[/:name]` | Python; never called; synthetic output | no | delete |
| `GET /api/obstacles` | 122 MB BAZL dataset indexed in memory | no (128 MB memory, 10 ms CPU) | static shards built at build time ([target.md](target.md)) |
| `GET /api/obstacles/tiles/bazl/:z/:x/:y.pbf` | unbounded disk writes; never called | yes, unneeded | delete |
| `GET /api/dabs` | static JSON | yes | build it in the browser in `ShvApi.getDabs()` |
| `/api/auth/*` | `node:crypto`, `Buffer`, sessions and PKCE in in-memory `Map`s (`auth.js:4, :7`) | no as written | dropped for now (PR13) |
| static + SPA fallback | `fs` | n/a | Pages static assets |

Browser-side fetches (GeoJSON snapshots with CDN fallback, outlook frames, swisstopo/OSM tiles, webcam images) stay as they are. `ShvApi.getEmagramSounding` calls `/api/emagram/sounding`, which does not exist and is never called: delete it.

## Dead code and duplication

- `emagram_calc.py` and every route that reaches it are dead, and `generate_location_sounding` (`:218-283`) makes up a sounding with a hardcoded inversion, against the no-fake-data rule. The Python "port" is a deletion; only `analyze_sounding` (`:56-201`) is worth an optional TypeScript port.
- `state.js:346-375` `setProfilePreset` writes made-up pilot profiles and is never called.
- Three dead `ShvApi` methods (`api.js:196-245`). `lucide` is never imported. `puppeteer-core` is imported by the screenshot script but missing from `package.json`.
- `previtemps_stations.json` exists three times, byte-identical. Keep `src/data/` (where build-time data lives in the target layout) and delete the others.
- The Kelvin/hPa conversion is copied in `server/index.js`, `WeatherView.js` and `BottomSheet.js`; it moves to `src/scripts/units.ts`.
- i18n is shallow: `ForecastView.js` has no `t.` lookups, most strings are hardcoded German.

## Security issues to fix during the migration

1. **XSS through upstream data:** `ForecastView.sanitizeHtml` only strips `<style>`; upstream HTML goes into `innerHTML`; inline `onerror` handlers interpolate upstream URLs (`BottomSheet.js:340`, `WeatherView.js:256`); names go unescaped into attributes. The session id in localStorage makes this a session theft.
2. **Sessions:** bearer id and member profile (licence, insurance) in localStorage; server sessions never expire.
3. **`cors()` with `*`:** same-origin on Pages, drop it.
4. **Upstream query injection:** unencoded bbox and `parameters`. Hosts are fixed, so not full SSRF, but validate.
5. **Resource exhaustion:** caches keyed by user input, disk writes per tile path, a Python process per request.
6. **Client impersonation:** auth uses the official Android app's public Keycloak client (`auth.js:30`); a terms-of-use question, so login is dropped for now.
7. **User-Agent** `Mozilla/5.0 (SHV-FSVL-App/1.0)` (`:51`) poses as the official app.

No secrets are in the repo.

## Hook constraints

- The 5,000-token budget is skipped for the paths in the file-tokens `exclude:` list in `lefthook.yml` (seven legacy code files and `docs/architecture.md`). It matches paths, so an oversized file stays at its path until the PR that splits it, and that PR removes it from the list.
- PR3 escaped every en dash in code and made the legacy files oxlint- and prettier-clean, so editing them in place is fine.

# Deployment

The app ships as one Docker image: the built frontend plus the Express API in a single Node process. There is no hosted deployment or CI in this repo yet; a move to Astro on Cloudflare Pages is planned.

## Docker Compose

```bash
docker compose up --build -d   # build and start on http://localhost:3000
docker compose down            # stop
```

[docker-compose.yml](../docker-compose.yml) maps port `3000`, sets `NODE_ENV=production` and `PORT=3000`, and restarts the container unless stopped.

## Plain Docker

```bash
docker build -t swiss-free-flight .
docker run -d --name swiss-free-flight -p 3000:3000 swiss-free-flight
```

## What the image contains

The [Dockerfile](../Dockerfile) has two stages:

1. **builder** (`node:22-alpine`): `npm install`, then `npm run build` into `dist/`.
2. **runner** (`node:22-alpine`): production dependencies, `server/`, `public/data/` and `dist/`, plus `python3` for [server/emagram_calc.py](../server/emagram_calc.py). It runs `node server/index.js` as the `node` user with `PORT=3000`, and the server serves `dist/` and `/api` on that port.

## Health check

Both the Dockerfile and the compose file probe `GET /api/health` every 30 seconds. The route answers locally without calling any upstream API, so an upstream outage does not mark the container unhealthy.

## State and secrets

- **No secrets.** The Keycloak client is the public `app-android` client with PKCE; there is no client secret or API key to configure.
- **Sessions are in memory.** Restarting the container drops every server session (the UI keeps showing the profile cached in the browser, so the stored session id goes stale), and more than one replica would need sticky sessions.
- **Obstacle cache.** The BAZL dataset is loaded into memory on the first `/api/obstacles` request and kept until the process restarts. On that load the server reuses `/app/server/cache/bazl_obstacles.geojson` if it is under 24 hours old, otherwise it downloads it again; a running container never refreshes it. Vector tiles are cached in the same folder with no expiry. Everything is lost when the container is recreated.

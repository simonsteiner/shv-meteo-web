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
- **Sessions are in memory.** Restarting or scaling the container logs everyone out, and more than one replica would need sticky sessions.
- **Disk cache.** BAZL obstacle data is cached in `/app/server/cache/` inside the container; it is rebuilt after 24 hours or when the container is recreated.

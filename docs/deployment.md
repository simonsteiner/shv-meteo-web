# Deployment

The site is static Astro output on Cloudflare Pages, project `shv-meteo`, served at <https://shv-meteo.pages.dev>. [wrangler.jsonc](../wrangler.jsonc) names the project and the output directory (`dist/`); there are no bindings and no secrets.

Until the Pages Functions land (PR9 of the [migration plan](plan/2026-11-23-astro-cloudflare/prs-api.md)), a deploy serves the pages without an API: every `/api` call answers 404, so live weather, Foehn and webcams are missing there. The Express server in `server/` runs only in local development.

## One-time setup (the repo owner)

```bash
npx wrangler login
npx wrangler pages project create shv-meteo --production-branch main
```

## Deploy on merge

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) deploys every merge to `main` once [ci](../.github/workflows/ci.yml) has passed on it, and only `main`'s head: when ci finishes on an older commit, that run is skipped. It needs two repo secrets (Settings, Secrets and variables, Actions): `CLOUDFLARE_API_TOKEN`, a token with the Account permission "Cloudflare Pages: Edit", and `CLOUDFLARE_ACCOUNT_ID`. Actions, deploy, "Run workflow" on `main` redeploys by hand.

## Deploy by hand

```bash
npm ci
npm run build
npx wrangler pages deploy dist --project-name shv-meteo --branch main
```

`--branch main` makes it the production deployment. Another branch name gives a preview deployment at `https://<branch>.shv-meteo.pages.dev`.

## Rollback

In the Cloudflare dashboard: Workers & Pages, `shv-meteo`, Deployments, then Rollback on the last good one. Then fix forward.

## What Pages serves

- `dist/` as static files: one page per tab (`/map/`, `/weather/`, `/forecast/`, `/safety/`, `/profile/`), `public/` copied as is (assets and the GeoJSON snapshots under `/data/`).
- [public/_redirects](../public/_redirects): `/` to `/map/`.

## State and secrets

- **No secrets.** The site has no API keys or client secrets.
- **No server state.** What a visitor sets (language, theme, map layers and filters, flight log) stays in their browser's localStorage under `shv_*` keys; the pre-flight checklist stays in sessionStorage.

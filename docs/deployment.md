# Deployment

The site is static Astro output on Cloudflare Pages, project `shv-meteo`, served at <https://shv-meteo.pages.dev>. [wrangler.jsonc](../wrangler.jsonc) names the project and the output directory (`dist/`); there are no bindings and no secrets.

The API is Pages Functions in `functions/api/`, deployed with the pages by the same `wrangler pages deploy`. The BAZL obstacles are static shards built before each deploy (`npm run obstacles`).

## One-time setup (the repo owner)

```bash
npx wrangler login
npx wrangler pages project create shv-meteo --production-branch main
```

## Deploy on merge

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) deploys every merge to `main` once [ci](../.github/workflows/ci.yml) has passed on it, and once a day at 03:17 UTC to refresh the obstacle shards (the downloaded dataset is cached a day under `.cache/obstacles`, and yesterday's copy is used when the download fails), and only `main`'s head: when ci finishes on an older commit, that run is skipped, and production stays on the last deployed commit until ci passes on a newer head. A scheduled or manual run deploys only once ci has passed on `main`'s head; that check is its own `gate` job, so a run that won't deploy stops there and never cancels a deploy in progress (one deploy runs at a time, and a newer one cancels the older). It needs two repo secrets (Settings, Secrets and variables, Actions): `CLOUDFLARE_API_TOKEN`, a token with the Account permission "Cloudflare Pages: Edit", and `CLOUDFLARE_ACCOUNT_ID`. Actions, deploy, "Run workflow" on `main` redeploys by hand.

## Deploy by hand

```bash
npm ci
npm run obstacles   # the BAZL obstacle shards, public/data/obstacles/ (downloads about 128 MB)
npm run build
npx wrangler pages deploy dist --project-name shv-meteo --branch main
```

`--branch main` makes it the production deployment. Another branch name gives a preview deployment at `https://<branch>.shv-meteo.pages.dev`.

## Rollback

In the Cloudflare dashboard: Workers & Pages, `shv-meteo`, Deployments, then Rollback on the last good one. Then fix forward.

## What Pages serves

- `dist/` as static files: one page per tab (`/map/`, `/weather/`, `/forecast/`, `/safety/`; `/profile/` redirects to `/map/`), `public/` copied as is (assets and the GeoJSON snapshots under `/data/`).
- [public/_redirects](../public/_redirects): `/` to `/map/` (302), and `/profile/` and `/profile` to `/map/` (301).
- [public/_headers](../public/_headers): `frame-ancestors 'none'`, `Referrer-Policy` and `nosniff` on every response. The rest of the Content Security Policy is a meta tag the build writes into each page ([src/scripts/access/csp.ts](../src/scripts/access/csp.ts)).
- `functions/api/**`: the Pages Functions, at their file paths under `/api/`.

## State and secrets

- **No secrets.** The site has no API keys or client secrets.
- **No server state.** The Functions keep their last good upstream answers in the edge cache only. What a visitor sets (language, theme, map layers and filters, flight log) stays in their browser's localStorage under `shv_*` keys; the pre-flight checklist stays in sessionStorage.

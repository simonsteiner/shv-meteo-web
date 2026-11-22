# Open questions

Each has a recommended default; the plan assumes the default until decided otherwise.

## Decided (2026-11-23)

- **Pages project:** `shv-meteo`, served at `https://shv-meteo.pages.dev`; no custom domain yet.
- **Docker:** dropped. PR5 deletes it; Express stays for local dev only until PR15.
- **SHV member login:** dropped for now (PR13 `chore/drop-auth`). It reused the official app's public Keycloak client and handled licence and insurance data; revisit if SHV allows a web client, using the cookie design in [target.md](target.md).

## Open

1. **Cloudflare plan?** Default Free. If PR10 hits the CPU limit, compute the Foehn report in the browser from the measurements the map already loads.
2. **Obstacles from shards or upstream vector tiles?** Default shards: same LOD rules and icons, no VectorGrid dependency.
3. **Deploy on merge or by hand?** Default: CI deploy on merge to `main` plus a daily schedule that refreshes obstacles and snapshots.
4. **Language routes (`/fr/map/`)?** Default no; keep the runtime switch (`shv_lang`, default `de`) until the view refactors have extracted the strings.
5. **`astro check` in pre-commit or pre-push?** Default pre-push (too slow for pre-commit, as in the reference project); CI runs it too.
6. **Package name and branding?** Default: package `shv-meteo-web` (PR5); keep the UI name "Swiss Free Flight".
7. **The 36 MB `screenshots/` folder?** Default: keep it, regenerate with `scripts/shot.ts` after PR21.
8. **Upstream User-Agent?** Default `shv-meteo-web (+<repo url>)`; never pose as the official app.

# Architecture

How this web app gets, processes and shows its data. Static Astro pages on Cloudflare Pages, legacy vanilla JavaScript views, and Pages Functions for the upstream calls a browser can't make. For how the official native app and its backends work (Keycloak, member web service, `UserProfile` payload), see [reference/shv-native-app.md](reference/shv-native-app.md).

- [architecture/data-pipeline.md](architecture/data-pipeline.md): the upstream sources, the flying-site data model, telemetry units, forecasts, soundings and BAZL obstacles.
- [architecture/data-queries.md](architecture/data-queries.md): which calls go straight from the browser and which through a Function in `functions/api/`, the rules every Function keeps, and the edge-cache spike.
- [architecture/web.md](architecture/web.md): pages, views, the data client, translations, the API and the dev launcher.
- [architecture/zero-fake-data.md](architecture/zero-fake-data.md): no mock, sample or synthesized data.

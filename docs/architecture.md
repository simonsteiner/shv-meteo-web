# Architecture

How this web app gets, processes and shows its data. Static Astro pages with TypeScript page scripts on Cloudflare Pages, and Pages Functions for the upstream calls a browser can't make. The diagram below is our runtime; the official native app's hosts, and which of them we use, are in [reference/shv-native-app.md](reference/shv-native-app.md), and its login and member data in [reference/shv-native-auth.md](reference/shv-native-auth.md).

```mermaid
flowchart LR
  subgraph browser["Browser: Astro pages, ShvApi (src/scripts/api.ts)"]
    pages["map, weather, forecast, safety"]
  end
  subgraph pagesdev["Cloudflare Pages"]
    static["public/data/: flying sites, airspaces, wildlife zones,<br/>sounding stations, obstacle shards"]
    fn["Functions /api/*<br/>measurements, timeseries, webcams,<br/>text-forecast, foehn, previtemps forecast"]
    cache[("edge cache:<br/>last good answer")]
  end
  subgraph direct["Upstreams the browser loads directly"]
    tiles["wmts.geo.admin.ch (swisstopo, glider chart),<br/>tile.openstreetmap.org"]
    outlooks["static-prod.ubmeteo.io: outlook frames"]
    isobars["shv-app-ws-prod.shv-app.ch: isobar SVG, as an img"]
  end
  subgraph proxied["Upstreams a browser can't call"]
    weather["weather-ws-prod.ubmeteo.io:<br/>measurements, timeseries, ICON point data"]
    webcams["webcam-prod.ubmeteo.io"]
    text["shv-app-ws-prod.shv-app.ch: text forecast"]
  end
  cdn["shv-app-static-prod.ubmeteo.io:<br/>GeoJSON CDN, bazl.geojson"]

  pages --> static
  pages --> fn
  pages --> tiles & outlooks & isobars
  pages --> cdn
  fn --> weather & webcams & text
  fn <--> cache
  cdn -. "npm run obstacles, at deploy" .-> static
```

Each upstream in the diagram has a row in [data-queries.md](architecture/data-queries.md), with the reason for its path.

- [architecture/data-queries.md](architecture/data-queries.md): every upstream, which calls go straight from the browser and which through a Function in `functions/api/`, the rules every Function keeps, and the edge-cache, CPU and vector-tile spikes. Read it before adding or changing an endpoint.
- [architecture/data-pipeline.md](architecture/data-pipeline.md): what the data holds and how the app reads it: the GIS datasets, flying sites, station pairs, measurement units, map controls, forecasts, soundings and BAZL obstacles.
- [architecture/web.md](architecture/web.md): pages, the shell, state, the tab pages, the CSP, the data client, translations, the API and the dev launcher.

The rule against mock, sample or synthesized data, and the one against accepting SHV passwords, are hard constraints in [AGENTS.md](../AGENTS.md).

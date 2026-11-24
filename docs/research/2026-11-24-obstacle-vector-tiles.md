# BAZL obstacles: upstream's vector tiles against our shards

Date: 2026-11-24, between 19:15 and 19:30 UTC. The plan's F7 ([follow-ups](../plan/2026-11-24-follow-ups/README.md)) asked whether the map could read upstream's obstacle tiles above z8 and keep the shards only for z7 and z8. PR12's spike ([data-queries.md](../architecture/data-queries.md), "Spike: BAZL vector tiles") had checked one z9 and one z12 tile; this note checks every z9 tile and 400 z12 tiles, and weighs what the switch would cost. Tiles came from `shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf` with User-Agent `shv-meteo-web (+https://github.com/simonsteiner/shv-meteo-web)`; the dataset from `bazl.geojson` on the same host, downloaded by `npm run obstacles` minutes before. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Summary

- **The tiles are nearly complete.** Every z9 tile holding an obstacle (27) misses 59 of the 104,874 features the map shows at z11 (0.06%), 3 of 24,341 at z9; 400 z12 tiles miss 3 of 108,925 at z13. The gaps are short cable car, catenary and power line pieces, plus new cranes: the tiles are a slightly different snapshot from `bazl.geojson` (they also hold 9 features the dataset no longer has).
- **But a z9 tile carries z11 detail**, so from z9 to z11 a view would read 1 to 3 times the bytes it reads from the shards today: at z9, 2.9 to 3.1 MB gzip against about 1.1 MB. Only z12 and z13 views get lighter (48 to 401 KB against 160 to 572 KB).
- **The build stays.** The z7 tier still needs the full 128 MB download every day, so tiles would shrink the deploy's output (247 MB) but not remove the step.
- **Verdict: not worth it now.** Reading tiles from z9 makes the common zooms heavier; the variant that pays (tiles only for z12 and z13, shards up to z11) saves about 150 MB of build output and some bytes on close views, against a runtime dependency on a third-party CDN, a protobuf decoder and lines cut at tile edges. Revisit if the shards near a Pages limit (20,000 files a deploy, 25 MiB a file) or upstream publishes tiles cut per zoom.

## Completeness

For each tile, the expected features are those `visibleAt` (`src/scripts/obstacles/lod.ts`) shows at the zooms the tile would serve (z9 to z11 for a z9 tile, z12 and z13 for a z12 tile) and whose geometry crosses the tile (segments clipped to the tile, a hair inside its edge so a feature on the edge doesn't count). A feature counts as present when a tile feature has the same `featureKey` (`sourceId`, geometry type, `partIndex`); the tiles carry all three, and the properties `slim` keeps for the map (a null one, such as most `airport` values, is left out, as MVT does).

| Tiles | Zoom shown | Features expected | Missing |
| :--- | :--- | ---: | ---: |
| all 27 z9 tiles with obstacles (9.5 MB decoded, 106,171 tile features) | z9 | 24,341 | 3 |
| | z10 | 51,979 | 15 |
| | z11 | 104,874 | 59 |
| 400 z12 tiles: the 25 densest and 375 at random (seeded) of the 923 with obstacles (9.4 MB decoded) | z12 | 51,866 | 3 |
| | z13 | 108,925 | 3 |

The 62 distinct misses: 23 catenaries, 19 cable car spans, 10 power line spans (most 0 to 6 m above ground, effective since 2024 or 2025) and 10 cranes (most effective from 2026). Nine tile features (cranes and a few lines registered in 2026) are not in `bazl.geojson`. No empty tile sits over an obstacle; outside Switzerland tiles answer 404, as the capture found.

## Bytes per view

A 1280 by 800 view padded by a fifth on each side, as `layer-obstacles.ts` loads it; shards read as `loadObstacles` reads them (only the quarters of a split cell the view touches), tiles as the ones the view touches. Shards gzip at level 6 (Pages serves them brotli, smaller still); tiles as upstream sends them (gzip).

| View | Shards today | Upstream tiles |
| :--- | :--- | :--- |
| Interlaken z9 | z9 tier, 25 files, 1,086 KB | 40 z9 tiles, 3,096 KB |
| Interlaken z11 | z11 tier, 22 files, 1,022 KB | 6 z9 tiles, 1,385 KB |
| Interlaken z12 | z12 tier, 8 files, 363 KB | 48 z12 tiles, 401 KB |
| Interlaken z13 | z13 tier, 11 files, 460 KB | 15 z12 tiles, 126 KB |
| Zürich z9 | 21 files, 1,070 KB | 40 tiles, 3,026 KB |
| Zürich z11 | 18 files, 811 KB | 6 tiles, 766 KB |
| Zürich z13 | 2 files, 211 KB | 12 tiles, 96 KB |
| Sion z11 | 15 files, 455 KB | 6 tiles, 485 KB |
| Lugano z11 | 12 files, 345 KB | 6 tiles, 428 KB |
| Lugano z13 | 4 files, 237 KB | 12 tiles, 48 KB |

A z9 tile decodes in about 25 ms in Node (11,714 features, 1.06 MB of protobuf, 6 MB as GeoJSON); a 0.5 MB shard parses in 2 ms. The shards per tier: z7 4.5 MB (13 files), z9 12 MB, z10 26 MB, z11 53 MB, z12 54 MB, z13 108 MB (155 files); 453 files, 247 MB in all.

## What the switch would take

- **A decoder.** `pbf` 4 and `@mapbox/vector-tile` 2, bundled for ES2020 and minified: 14.8 KB, 4.4 KB gzip, no builtins newer than the target. Leaflet.VectorGrid 1.3.0 (last release 2017-08) is 46.5 KB, 14.9 KB gzip, needs a global `L`, and would replace our canvas layer, its icons and its picks; the decoder alone feeding today's layer is the cheaper path.
- **Lines cut at tile edges.** A tile clips each line to its own box, and the layer dedupes by `_uid`, so a line crossing tiles would lose all but one piece; the key would need the tile, and the sheet would show the piece's centre.
- **An upstream at runtime.** The shards are our own files; tiles would make the close zooms depend on `shv-app-static-prod.ubmeteo.io` (CORS `*`, `max-age=86400`) with no fallback, unlike the GeoJSON snapshots `ShvApi` falls back from.
- **The build unchanged.** `deploy.yml` would still download the dataset daily for the z7 tier; only the written output shrinks (to 4.5 MB for z7 alone, or about 96 MB with shards up to z11).

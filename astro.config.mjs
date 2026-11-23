// @ts-check
import { defineConfig } from "astro/config";

// Fully static: one page per tab (src/pages/<tab>/index.astro), served by
// Cloudflare Pages. The API is Express on :3001 until the Pages Functions
// replace it (docs/plan/2026-11-23-astro-cloudflare/prs-api.md, PR9); in dev
// `astro dev` proxies /api to it.
export default defineConfig({
  site: "https://shv-meteo.pages.dev",
  vite: {
    // Until PR9 removes Express, its cookie@0.7 is the one hoisted to
    // node_modules/, and the prerender bundle would import it in place of
    // Astro's cookie@2; bundling it resolves Astro's own.
    environments: { prerender: { resolve: { noExternal: ["cookie"] } } },
    server: {
      proxy: {
        "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      },
    },
    build: {
      // The browser floor the Vite 6 build had (its default), kept on
      // purpose: Vite 8's default is Safari 16.4, Chrome 111 and Firefox
      // 114. Syntax is lowered to it; builtins are not polyfilled, so browser
      // code uses nothing newer than ES2020's.
      target: ["edge88", "firefox78", "chrome87", "safari14"],
      // Leaflet and Chart.js each get a chunk of their own, so their hashes
      // (and the browser cache) survive a change to the app's code.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "leaflet", test: /node_modules[\\/]leaflet[\\/]/ },
              { name: "chartjs", test: /node_modules[\\/]chart\.js[\\/]/ },
            ],
          },
        },
      },
    },
  },
});

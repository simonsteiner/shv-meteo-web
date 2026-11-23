// @ts-check
import { defineConfig } from "astro/config";

// Fully static: one page per tab (src/pages/<tab>/index.astro), served by
// Cloudflare Pages, with the API as Pages Functions (functions/api/). In dev
// `astro dev` proxies /api to `wrangler pages dev` on :8788 (scripts/dev.ts).
export default defineConfig({
  site: "https://shv-meteo.pages.dev",
  vite: {
    server: {
      proxy: {
        "/api": { target: "http://127.0.0.1:8788", changeOrigin: true },
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

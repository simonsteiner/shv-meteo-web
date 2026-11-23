// `npm run dev`: the Express API on :3001 and `astro dev` on :4321, which
// proxies /api to it (astro.config.mjs). Ctrl-C stops both. Until the Pages
// Functions replace Express (docs/plan/2026-11-23-astro-cloudflare, PR9).
import { spawn } from "child_process";

console.log("[Dev] Starting SHV Backend API on port 3001...");
const backend = spawn("node", ["server/index.js"], { stdio: "inherit" });

console.log("[Dev] Starting Astro dev server on port 4321...");
const astro = spawn("npx", ["astro", "dev", "--host"], { stdio: "inherit" });

const shutdown = () => {
  console.log("[Dev] Shutting down servers...");
  backend.kill();
  astro.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// `npm run dev`: `astro dev` on :4321, which proxies /api to
// `wrangler pages dev public` on :8788, which compiles functions/ itself
// and needs no build (the site has no bindings or secrets). A route not
// ported to a Function yet is a 404 here, as in production. Ctrl-C stops
// both.
import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [
  spawn("npx", ["wrangler", "pages", "dev", "public", "--port", "8788"], {
    stdio: "inherit",
  }),
  // --ignore-lock keeps astro dev in the foreground, where this script can
  // stop it: Astro 7 otherwise backgrounds itself when it thinks an agent
  // started it
  spawn(
    "npx",
    ["astro", "dev", "--host", "--ignore-lock", ...process.argv.slice(2)],
    {
      stdio: "inherit",
    },
  ),
];

let stopping = false;
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

for (const child of children)
  child.on("exit", (code) => {
    console.error(
      `[dev] ${child.spawnargs.slice(1, 3).join(" ")} exited (${code})`,
    );
    stop(code ?? 1);
  });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

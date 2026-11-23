// `npm run dev`: `astro dev` on :4321, which proxies /api to
// `wrangler pages dev public` on :8788, which compiles functions/ itself
// and needs no build (the site has no bindings or secrets). A route not
// ported to a Function yet is a 404 here, as in production. Ctrl-C stops
// both.
import { spawn, type ChildProcess } from "node:child_process";

/** Each command in a process group of its own, so stopping it reaches what
 * npx started under it (wrangler's workerd), not only npx. */
function start(args: string[]): ChildProcess {
  return spawn("npx", args, { stdio: "inherit", detached: true });
}

const children = [
  start(["wrangler", "pages", "dev", "public", "--port", "8788"]),
  // --ignore-lock keeps astro dev in the foreground, where this script can
  // stop it: Astro 7 otherwise backgrounds itself when it thinks an agent
  // started it
  start(["astro", "dev", "--host", "--ignore-lock", ...process.argv.slice(2)]),
];

let stopping = false;
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (err) {
      console.error(`[dev] Cannot stop ${child.spawnargs.join(" ")}:`, err);
    }
  }
  process.exit(code);
}

for (const child of children)
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(
      `[dev] ${child.spawnargs.slice(1, 3).join(" ")} exited (${code})`,
    );
    stop(code ?? 1);
  });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

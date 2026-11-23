// A screenshot of a page as a visitor sees it, tiles and all:
//   npm run shot -- URL OUT.png [--size 1280x800] [--wait MS]
// Launches a headless Chromium ($CHROME, else Playwright's newest under
// ~/.cache/ms-playwright, else `chromium` on PATH), opens URL over the
// DevTools protocol, waits for its load event plus --wait ms (default 3000)
// and writes a PNG. A protocol client rather than `chromium --headless
// --screenshot`: the map's tiles load over the network after the load
// event, and that flag's --virtual-time-budget waits in virtual time, which
// doesn't reliably wait for them. The page's exceptions and console errors
// are printed. Against a running `npm run dev` or `npm run preview`.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: "string", default: "1280x800" },
    wait: { type: "string", default: "3000" },
  },
});
const [url, out] = positionals;
const [width, height] = values.size.split("x").map(Number);
const wait = Number(values.wait);
if (!url || !out || !width || !height || !Number.isFinite(wait)) {
  console.error("usage: npm run shot -- URL OUT.png [--size WxH] [--wait MS]");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** $CHROME, else the newest Playwright Chromium, else `chromium`. */
function chromePath(): string {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    const builds = readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const build of builds)
      for (const dir of ["chrome-linux64", "chrome-linux"]) {
        const bin = join(cache, build, dir, "chrome");
        if (existsSync(bin)) return bin;
      }
  }
  return "chromium";
}

/** Starts Chromium and resolves its DevTools browser WebSocket URL. */
function launch(profile: string) {
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = new Promise<string>((resolve, reject) => {
    let log = "";
    chrome.stderr.on("data", (chunk: Buffer) => {
      log += chunk.toString();
      const found = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) resolve(found[1]);
    });
    chrome.on("error", reject);
    chrome.on("exit", (code) =>
      reject(new Error(`Chromium exited (${code}) before DevTools:\n${log}`)),
    );
  });
  return { chrome, endpoint };
}

type Listener = (params: Record<string, unknown>) => void;

/** A DevTools session on the page's own WebSocket. */
async function connect(pageWs: string) {
  const ws = new WebSocket(pageWs);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map<
    number,
    (msg: { result?: unknown; error?: unknown }) => void
  >();
  const listeners = new Map<string, Listener[]>();
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id) pending.get(msg.id)?.(msg);
    if (msg.method)
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
  };
  const send = <T>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => {
      pending.set(++id, (msg) =>
        msg.error
          ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`))
          : resolve(msg.result as T),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  const on = (method: string, fn: Listener) =>
    listeners.set(method, [...(listeners.get(method) ?? []), fn]);
  return { send, on, close: () => ws.close() };
}

const profile = mkdtempSync(join(tmpdir(), "shot-"));
const { chrome, endpoint } = launch(profile);
try {
  const origin = new URL(await endpoint).host;
  const targets = (await (
    await fetch(`http://${origin}/json/list`)
  ).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const target = targets.find((t) => t.type === "page");
  if (!target) throw new Error("Chromium opened no page");
  const page = await connect(target.webSocketDebuggerUrl);

  page.on("Runtime.exceptionThrown", (p) => {
    const d = p.exceptionDetails as {
      text: string;
      exception?: { description?: string };
    };
    console.log("exception:", d.exception?.description ?? d.text);
  });
  page.on("Runtime.consoleAPICalled", (p) => {
    if (p.type !== "error") return;
    const args = p.args as { value?: unknown; description?: string }[];
    console.log(
      "console.error:",
      args.map((a) => a.value ?? a.description).join(" "),
    );
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const loaded = new Promise<void>((resolve) => {
    page.on("Page.loadEventFired", () => resolve());
    setTimeout(resolve, 30_000);
  });
  await page.send("Page.navigate", { url });
  await loaded;
  await sleep(wait);

  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`wrote ${out}`);
  page.close();
} finally {
  chrome.kill();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}

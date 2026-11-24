import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { fetchUpstream } from "./fetch.ts";
import { proxy, respond } from "./respond.ts";
import { ROUTES } from "./routes.ts";

const route = ROUTES.measurements;
const KEY = "/api/_cache/measurements?";

/** A Request, a waitUntil that collects its promises, and their settling. */
function context(url = "https://shv-meteo.pages.dev/api/measurements") {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    request: new Request(url),
    env: {},
    params: {},
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
  } satisfies Context;
  return { ctx, settled: () => Promise.all(pending) };
}

/** An edge cache over a Map, keeping each body as text. */
function fakeCache() {
  const store = new Map<string, { body: string; headers: Headers }>();
  const cache = {
    async match(req: RequestInfo | URL) {
      const hit = store.get(new Request(req).url);
      return hit && new Response(hit.body, { headers: hit.headers });
    },
    async put(req: RequestInfo | URL, res: Response) {
      store.set(new Request(req).url, {
        body: await res.text(),
        headers: res.headers,
      });
    },
  } as unknown as Cache;
  return { cache, store };
}

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

/** Upstream answering `body`, as JSON unless `init` names another type. */
const upstream =
  (body: string, init: ResponseInit = {}) =>
  async () =>
    new Response(body, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });

test("a 200 carries the route's max-age and upstream's Content-Type only", async () => {
  const { ctx } = context();
  const res = await respond(
    route,
    KEY,
    upstream("{}", {
      headers: {
        "Content-Type": "application/geo+json",
        "Set-Cookie": "a=b",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    }),
    ctx,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/geo+json");
  assert.equal(res.headers.get("Cache-Control"), "max-age=60");
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("the body is streamed unparsed", async () => {
  const { ctx } = context();
  const raw = '{"features": [1, 2,  3]} not even json';
  const res = await respond(route, KEY, upstream(raw), ctx);
  assert.equal(await res.text(), raw);
});

test("a timeout, a 4xx and a 5xx each answer the route's 503", async () => {
  const failures = [
    async () => {
      throw new DOMException("aborted", "AbortError");
    },
    upstream("nope", { status: 403 }),
    upstream("down", { status: 502 }),
  ];
  for (const fetcher of failures) {
    const { ctx } = context();
    const res = await quietly(() => respond(route, KEY, fetcher, ctx));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), {
      error: "Live-Messwerte vorübergehend nicht erreichbar",
      features: [],
    });
  }
});

test("a fresh copy is served without upstream", async () => {
  const { cache } = fakeCache();
  const first = context();
  await respond(route, KEY, upstream("v1"), first.ctx, cache, 1_000);
  await first.settled();
  let called = false;
  const again = context();
  const res = await respond(
    route,
    KEY,
    async () => ((called = true), Response.json("v2")),
    again.ctx,
    cache,
    31_000,
  );
  assert.equal(called, false);
  assert.equal(await res.text(), "v1");
  assert.equal(res.headers.get("x-cache"), "hit");
  assert.equal(res.headers.get("Cache-Control"), "max-age=30");
});

test("a stale copy is refetched, and served when the refetch fails", async () => {
  const { cache } = fakeCache();
  const first = context();
  await respond(route, KEY, upstream("v1"), first.ctx, cache, 0);
  await first.settled();

  const failed = context();
  const res = await quietly(() =>
    respond(
      route,
      KEY,
      upstream("", { status: 500 }),
      failed.ctx,
      cache,
      61_000,
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "v1");
  assert.equal(res.headers.get("x-cache"), "stale");
  assert.equal(res.headers.get("Cache-Control"), "no-store");

  const refetched = context();
  const fresh = await respond(
    route,
    KEY,
    upstream("v2"),
    refetched.ctx,
    cache,
    62_000,
  );
  await refetched.settled();
  assert.equal(await fresh.text(), "v2");
  assert.equal(fresh.headers.get("x-cache"), "miss");
});

test("a 503 is never stored", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context();
  await quietly(() =>
    respond(route, KEY, upstream("", { status: 503 }), ctx, cache),
  );
  await settled();
  assert.equal(store.size, 0);
});

test("proxy keys the copy by the checked parameters", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context(
    "https://shv-meteo.pages.dev/api/meteo/text-forecast/en?x=1",
  );
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({})) as typeof fetch;
  try {
    await proxy("textForecast", { ...ctx, params: { lang: "en" } }, cache);
  } finally {
    globalThis.fetch = real;
  }
  await settled();
  assert.deepEqual(
    [...store.keys()],
    ["https://shv-meteo.pages.dev/api/_cache/textForecast?lang=de"],
  );
});

test("proxy answers a bad id with a 400 before going upstream", async () => {
  const { ctx } = context();
  const res = await proxy("timeseries", { ...ctx, params: { id: "a/b" } });
  assert.equal(res.status, 400);
});

test("a 200 that isn't JSON is an upstream failure: a 503, nothing kept", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context();
  const res = await respond(
    route,
    KEY,
    upstream("<html>maintenance</html>", {
      headers: { "Content-Type": "text/html" },
    }),
    ctx,
    cache,
  );
  await settled();
  assert.equal(res.status, 503);
  assert.equal(store.size, 0);
});

test("a proxied body that stalls errors for the client and is never kept", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context();
  const stall = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"features": ['));
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  const res = await quietly(async () => {
    const answer = await respond(
      route,
      KEY,
      () => fetchUpstream("https://upstream.test/x", 50, stall),
      ctx,
      cache,
    );
    await assert.rejects(answer.text(), { name: "TimeoutError" });
    await settled();
    return answer;
  });
  assert.equal(res.status, 200);
  assert.equal(store.size, 0);
});

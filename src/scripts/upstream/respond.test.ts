import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { fetchUpstream } from "./fetch.ts";
import { proxy, respond } from "./respond.ts";
import { ROUTES, startBefore } from "./routes.ts";

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
    async delete(req: RequestInfo | URL) {
      return store.delete(new Request(req).url);
    },
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
  await respond(route, KEY, upstream('"v1"'), first.ctx, cache, 0);
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
  assert.equal(await res.text(), '"v1"');
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

test("the timeseries route asks for the last 24 hours, its copy keyed by station alone", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context(
    "https://shv-meteo.pages.dev/api/measurements/timeseries/meteo_swiss%3AKLO",
  );
  const asked: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return Response.json({ timeseries: [] });
  }) as typeof fetch;
  const before = Date.now();
  try {
    await proxy(
      "timeseries",
      { ...ctx, params: { id: "meteo_swiss%3AKLO" } },
      cache,
    );
  } finally {
    globalThis.fetch = real;
  }
  const after = Date.now();
  await settled();
  const start = Number(new URL(asked[0]).searchParams.get("start"));
  assert.equal(start % 60_000, 0);
  // proxy reads its own clock between the two, so a minute may turn there
  const day = 24 * 3600_000;
  assert.ok(
    startBefore(before, day) <= start && start <= startBefore(after, day),
    `${start}`,
  );
  assert.deepEqual(
    [...store.keys()],
    ["https://shv-meteo.pages.dev/api/_cache/timeseries?id=meteo_swiss%3AKLO"],
  );
});

test("the timeseries start moves only once a minute", () => {
  const url = (now: number) =>
    new URL(ROUTES.timeseries.url!({ id: "meteo_swiss:KLO" }, now));
  const minute = Date.UTC(2026, 10, 24, 12, 0);
  assert.equal(
    url(minute).searchParams.get("start"),
    String(minute - 86_400_000),
  );
  assert.equal(url(minute + 59_999).search, url(minute).search);
  assert.notEqual(url(minute + 60_000).search, url(minute).search);
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

test("a stale copy that isn't JSON is dropped, and the route answers 503", async () => {
  const { cache, store } = fakeCache();
  const first = context();
  // upstream's body is stored unchecked: a truncated answer gets in
  await respond(
    route,
    KEY,
    upstream('{"features": [1, 2'),
    first.ctx,
    cache,
    0,
  );
  await first.settled();
  assert.equal(store.size, 1);

  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  const failed = context();
  try {
    const res = await respond(
      route,
      KEY,
      upstream("", { status: 502 }),
      failed.ctx,
      cache,
      61_000,
    );
    await failed.settled();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), route.errorBody);
  } finally {
    console.error = original;
  }
  assert.equal(store.size, 0);
  assert.ok(
    logged.some((args) =>
      String(args[0]).startsWith("[respond] The cached copy"),
    ),
  );
});

/** Stores `body` as the copy, then answers with upstream failing once it is
 * stale, collecting what was logged. */
async function fallBackTo(body: string) {
  const { cache, store } = fakeCache();
  const first = context();
  await respond(route, KEY, upstream(body), first.ctx, cache, 0);
  await first.settled();
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  const failed = context();
  try {
    const res = await respond(
      route,
      KEY,
      upstream("", { status: 502 }),
      failed.ctx,
      cache,
      61_000,
    );
    await failed.settled();
    return { res, store, logged };
  } finally {
    console.error = original;
  }
}

// above the 200 KB parse limit, as measurements' 2 MB copy is
const big = `{"features": [${"1,".repeat(150_000)}1]}\n`;

test("a large stale copy with matching brackets is served unparsed", async () => {
  const { res, store } = await fallBackTo(big);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-cache"), "stale");
  assert.equal(await res.text(), big);
  assert.equal(store.size, 1);
});

test("a large truncated stale copy is dropped, and the route answers 503", async () => {
  const { res, store, logged } = await fallBackTo(big.slice(0, -3));
  assert.equal(res.status, 503);
  assert.equal(store.size, 0);
  assert.ok(
    logged.some((args) =>
      String(args[0]).startsWith("[respond] The cached copy"),
    ),
  );
});

test("a stale copy that fails to read answers 503 and is kept", async () => {
  let deleted = false;
  const cache = {
    async delete() {
      deleted = true;
      return true;
    },
    async match() {
      const body = new ReadableStream({
        pull(controller) {
          controller.error(new Error("cache stream broke"));
        },
      });
      return new Response(body, { headers: { "x-fetched-at": "0" } });
    },
    async put() {},
  } as unknown as Cache;
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  const { ctx, settled } = context();
  try {
    const res = await respond(
      route,
      KEY,
      upstream("", { status: 502 }),
      ctx,
      cache,
      61_000,
    );
    await settled();
    assert.equal(res.status, 503);
  } finally {
    console.error = original;
  }
  assert.equal(deleted, false);
  assert.ok(
    logged.some((args) =>
      String(args[0]).startsWith("[respond] Cache read failed for"),
    ),
  );
});

/** Stores `body` for `which` route at time 0, then answers at `at` ms with
 * upstream answering `next` (a 502 by default). */
async function later(
  which: keyof typeof ROUTES,
  at: number,
  next = upstream("", { status: 502 }),
  body = '{"v": 1}',
) {
  const { cache, store } = fakeCache();
  const first = context();
  await respond(ROUTES[which], KEY, upstream(body), first.ctx, cache, 0);
  await first.settled();
  const again = context();
  const res = await quietly(() =>
    respond(ROUTES[which], KEY, next, again.ctx, cache, at),
  );
  await again.settled();
  return { res, store };
}

test("a stale copy just inside the route's limit is served, with its fetch time", async () => {
  const limit = ROUTES.measurements.maxStaleSeconds * 1000;
  assert.equal(limit, 30 * 60_000);
  const { res } = await later("measurements", limit - 1);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-cache"), "stale");
  assert.equal(res.headers.get("x-fetched-at"), "0");
});

test("a stale copy just past the route's limit is not served: the 503", async () => {
  const limit = ROUTES.measurements.maxStaleSeconds * 1000;
  const { res } = await later("measurements", limit + 1);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), ROUTES.measurements.errorBody);
});

test("live values fall back at most an hour, a sounding a day", () => {
  for (const name of ["measurements", "timeseries", "foehn"] as const)
    assert.ok(ROUTES[name].maxStaleSeconds <= 3600, name);
  assert.equal(ROUTES.sounding.maxStaleSeconds, 24 * 3600);
  // a copy is kept as long as it can be served, no longer
  for (const r of Object.values(ROUTES)) assert.ok(r.maxStaleSeconds > r.ttl);
});

test("a sounding copy 23 hours old still stands in", async () => {
  const { res } = await later("sounding", 23 * 3600_000);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-cache"), "stale");
});

test("every 200 says when its body was fetched", async () => {
  const { cache } = fakeCache();
  const first = context();
  const miss = await respond(route, KEY, upstream("{}"), first.ctx, cache, 5);
  await first.settled();
  assert.equal(miss.headers.get("x-fetched-at"), "5");
  const again = context();
  const hit = await respond(route, KEY, upstream("{}"), again.ctx, cache, 10);
  assert.equal(hit.headers.get("x-cache"), "hit");
  assert.equal(hit.headers.get("x-fetched-at"), "5");
});

test("a fresh empty or cut-off 200 never replaces the good copy", async () => {
  for (const bad of ["", '{"webcams": [1, 2']) {
    const { res, store } = await later(
      "webcams",
      ROUTES.webcams.ttl * 1000 + 1,
      upstream(bad),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-cache"), "stale");
    assert.equal(await res.text(), '{"v": 1}');
    assert.equal([...store.values()][0].body, '{"v": 1}');
  }
});

test("a fresh empty 200 without a copy is the route's 503", async () => {
  const { cache, store } = fakeCache();
  const { ctx, settled } = context();
  const res = await quietly(() =>
    respond(ROUTES.webcams, KEY, upstream(""), ctx, cache),
  );
  await settled();
  assert.equal(res.status, 503);
  assert.equal(store.size, 0);
});

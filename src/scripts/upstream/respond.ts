// The answer a proxied route gives, the same for every route: upstream's
// body streamed unparsed with its Content-Type and our Cache-Control (cut
// off at the route's deadline if it stalls), and on a failure before that a
// 503 with the route's German error that no cache keeps.
// Functions keep no memory between requests, so Express's "last good copy"
// lives in the edge cache: each 200 is stored for a day, a copy younger than
// the route's TTL is served without calling upstream, an older one is
// refetched and still served when the refetch fails, if it still looks like
// JSON (the stored body is upstream's, never checked on the way in).
import type { Context } from "../types.ts";
import { fetchUpstream } from "./fetch.ts";
import { parseParams } from "./params.ts";
import { ROUTES, type Route, type RouteName } from "./routes.ts";

const DEFAULT_TYPE = "application/json; charset=utf-8";
/** When the cached copy was fetched, in ms since the epoch. */
const FETCHED_AT = "x-fetched-at";
/** How long the edge keeps a copy to fall back on. */
const KEEP_SECONDS = 24 * 60 * 60;
/** The largest stale copy parsed in full; a larger one (measurements is
 * about 3 MB) only has its outer brackets checked, since target.md keeps
 * every Function under about 200 KB of parsing and 10 ms of CPU. */
const PARSE_LIMIT = 200 * 1024;

function unavailable(route: Route): Response {
  return Response.json(route.errorBody, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

/** A cached copy as the answer: fresh for what is left of its TTL, or a
 * stale fallback that the browser must not keep. */
function fromCache(
  copy: Response,
  route: Route,
  ageMs: number,
  state: "hit" | "stale",
): Response {
  const left = Math.ceil((route.ttl * 1000 - ageMs) / 1000);
  return new Response(copy.body, {
    status: 200,
    headers: {
      "Content-Type": copy.headers.get("Content-Type") ?? DEFAULT_TYPE,
      "Cache-Control": state === "hit" ? `max-age=${left}` : "no-store",
      "x-cache": state,
    },
  });
}

/** Why `bytes` is not JSON, or null when it is: parsed in full up to
 * PARSE_LIMIT, above that only its first and last non-whitespace bytes must
 * be a matching `{`/`}` or `[`/`]`, which still catches a truncated body. */
function notJson(bytes: Uint8Array): unknown {
  if (bytes.length <= PARSE_LIMIT) {
    try {
      JSON.parse(new TextDecoder().decode(bytes));
      return null;
    } catch (err) {
      return err;
    }
  }
  const blank = (b: number | undefined) =>
    b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
  let first = 0;
  while (blank(bytes[first])) first++;
  let last = bytes.length - 1;
  while (last > first && blank(bytes[last])) last--;
  const pair = String.fromCharCode(bytes[first] ?? 0, bytes[last] ?? 0);
  return pair === "{}" || pair === "[]"
    ? null
    : new Error(`${bytes.length} bytes, framed by ${JSON.stringify(pair)}`);
}

/** The stale copy as the fallback answer when its body looks like JSON
 * (notJson); else null, so the route answers its 503 rather than a broken
 * body. A body that was read and failed the check is logged and dropped; a
 * failed read keeps the copy. Checked only here, when upstream has already
 * failed, so a fresh hit costs no check. */
async function fallback(
  stale: { copy: Response; ageMs: number },
  route: Route,
  key: string,
  drop: () => void,
): Promise<Response | null> {
  let body: ArrayBuffer;
  try {
    body = await stale.copy.arrayBuffer();
  } catch (err) {
    console.error(`[respond] Cache read failed for ${key}:`, err);
    return null;
  }
  const problem = notJson(new Uint8Array(body));
  if (problem) {
    console.error(`[respond] The cached copy of ${key} is not JSON:`, problem);
    drop();
    return null;
  }
  const copy = new Response(body, { headers: stale.copy.headers });
  return fromCache(copy, route, stale.ageMs, "stale");
}

/** Answers from the cache when fresh, else from `fetcher`, falling back to
 * a stale copy, else the route's 503. `key` names the copy (a path). */
export async function respond(
  route: Route,
  key: string,
  fetcher: () => Promise<Response>,
  ctx: Pick<Context, "request" | "waitUntil">,
  cache?: Cache,
  now: number = Date.now(),
): Promise<Response> {
  const cacheKey = new Request(new URL(key, ctx.request.url).toString());
  let stale: { copy: Response; ageMs: number } | undefined;
  if (cache) {
    try {
      const copy = await cache.match(cacheKey);
      if (copy) {
        const ageMs = now - Number(copy.headers.get(FETCHED_AT));
        if (ageMs >= 0 && ageMs < route.ttl * 1000)
          return fromCache(copy, route, ageMs, "hit");
        stale = { copy, ageMs };
      }
    } catch (err) {
      console.error(`[respond] Cache read failed for ${key}:`, err);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetcher();
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new Error(`upstream answered ${upstream.status}`);
    }
    // every route answers JSON: a 200 that isn't (a maintenance page) is an
    // upstream failure, so the client gets the stale copy or the 503
    const type = upstream.headers.get("Content-Type") ?? DEFAULT_TYPE;
    if (!/\bjson\b/i.test(type)) {
      await upstream.body?.cancel();
      throw new Error(`upstream answered 200 with ${type}`);
    }
  } catch (err) {
    console.error(`[respond] ${key}:`, err);
    const answer =
      stale &&
      (await fallback(stale, route, key, () =>
        ctx.waitUntil(
          Promise.resolve(cache?.delete(cacheKey)).catch((e: unknown) => {
            console.error(`[respond] Cache delete failed for ${key}:`, e);
          }),
        ),
      ));
    return answer ?? unavailable(route);
  }

  await stale?.copy.body?.cancel();
  const contentType = upstream.headers.get("Content-Type") ?? DEFAULT_TYPE;
  let body = upstream.body;
  if (cache && body) {
    const [toClient, toCache] = body.tee();
    body = toClient;
    const copy = new Response(toCache, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `max-age=${KEEP_SECONDS}`,
        [FETCHED_AT]: String(now),
      },
    });
    ctx.waitUntil(
      cache.put(cacheKey, copy).catch((err: unknown) => {
        console.error(`[respond] Cache write failed for ${key}:`, err);
      }),
    );
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `max-age=${route.ttl}`,
      "x-cache": "miss",
    },
  });
}

/** The edge cache where the runtime has one (Workers), else none (Node). */
function edgeCache(): Cache | undefined {
  return typeof caches !== "undefined" && "default" in caches
    ? caches.default
    : undefined;
}

/** A whole route: checks the parameters, then answers through `respond`
 * from what `fetcher` makes of them. What each Function in functions/api/
 * calls, through `proxy` for a route with one upstream. `check` may answer
 * instead (a 404 for a name the route doesn't know) before any upstream
 * call or cache lookup. */
export async function serve(
  name: RouteName,
  ctx: Context,
  fetcher: (params: Record<string, string>) => Promise<Response>,
  {
    cache = edgeCache(),
    check,
  }: {
    cache?: Cache;
    check?: (params: Record<string, string>) => Response | null;
  } = {},
): Promise<Response> {
  const search = new URL(ctx.request.url).searchParams;
  const params = parseParams(name, ctx.params, search);
  if (params instanceof Response) return params;
  const refused = check?.(params);
  if (refused) return refused;
  // the copy is keyed by the route and its checked parameters, so
  // `meteo_swiss%3AKLO` and `meteo_swiss:KLO`, or `en` and `de`, share one
  const query = new URLSearchParams(Object.entries(params).sort());
  return respond(
    ROUTES[name],
    `/api/_cache/${name}?${query}`,
    () => fetcher(params),
    ctx,
    cache,
  );
}

/** A route with a single upstream URL (routes.ts). */
export function proxy(
  name: RouteName,
  ctx: Context,
  cache: Cache | undefined = edgeCache(),
): Promise<Response> {
  const route = ROUTES[name];
  const url = route.url;
  if (!url) throw new Error(`[proxy] Route ${name} has no single upstream`);
  return serve(
    name,
    ctx,
    (params) => fetchUpstream(url(params), route.timeoutMs),
    { cache },
  );
}

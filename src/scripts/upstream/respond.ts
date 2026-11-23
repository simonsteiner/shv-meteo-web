// The answer a proxied route gives, the same for every route: upstream's
// body streamed unparsed with its Content-Type and our Cache-Control, and on
// any failure a 503 with the route's German error that no cache keeps.
// Functions keep no memory between requests, so Express's "last good copy"
// lives in the edge cache: each 200 is stored for a day, a copy younger than
// the route's TTL is served without calling upstream, an older one is
// refetched and still served when the refetch fails.
import type { Context } from "../types.ts";
import { fetchUpstream } from "./fetch.ts";
import { parseParams } from "./params.ts";
import { ROUTES, type Route, type RouteName } from "./routes.ts";

const DEFAULT_TYPE = "application/json; charset=utf-8";
/** When the cached copy was fetched, in ms since the epoch. */
const FETCHED_AT = "x-fetched-at";
/** How long the edge keeps a copy to fall back on. */
const KEEP_SECONDS = 24 * 60 * 60;

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
  } catch (err) {
    console.error(`[respond] ${key}:`, err);
    return stale
      ? fromCache(stale.copy, route, stale.ageMs, "stale")
      : unavailable(route);
  }

  const contentType = upstream.headers.get("Content-Type") ?? DEFAULT_TYPE;
  let body = upstream.body;
  // every route answers JSON: a 200 that isn't (a maintenance page) still
  // goes to the client, but never replaces the copy kept to fall back on
  if (cache && body && /\bjson\b/i.test(contentType)) {
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

/** A whole proxied route: what each Function in functions/api/ calls. */
export async function proxy(
  name: RouteName,
  ctx: Context,
  cache: Cache | undefined = edgeCache(),
): Promise<Response> {
  const search = new URL(ctx.request.url).searchParams;
  const params = parseParams(name, ctx.params, search);
  if (params instanceof Response) return params;
  const route = ROUTES[name];
  const url = route.url?.(params);
  if (!url) throw new Error(`[proxy] Route ${name} has no single upstream`);
  // the copy is keyed by the route and its checked parameters, so
  // `meteo_swiss%3AKLO` and `meteo_swiss:KLO`, or `en` and `de`, share one
  const query = new URLSearchParams(Object.entries(params).sort());
  return respond(
    route,
    `/api/_cache/${name}?${query}`,
    () => fetchUpstream(url, route.timeoutMs),
    ctx,
    cache,
  );
}

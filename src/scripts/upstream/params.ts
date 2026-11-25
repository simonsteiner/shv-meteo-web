// The helpers each route's `parse` (routes.ts) builds its answer from: a
// path parameter decoded once, and the 400 and 404 a parse answers with.
// Invalid input is refused here, before anything goes upstream.
import type { Route } from "./routes.ts";

function refuse(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function badRequest(error: string): Response {
  return refuse(400, error);
}

export function notFound(error: string): Response {
  return refuse(404, error);
}

/** The path parameter decoded once; null for a malformed escape. A catch-all
 * segment list is joined with `/`. */
export function decoded(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.join("/") : (value ?? "");
  try {
    return decodeURIComponent(raw);
  } catch (err) {
    console.error(`[params] Malformed escape in ${JSON.stringify(raw)}:`, err);
    return null;
  }
}

/** The `parse` of a route that takes no parameters: any path or query is
 * dropped, also from the cache key. */
export const none: Route["parse"] = () => ({});
